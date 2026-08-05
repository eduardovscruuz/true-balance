using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Enums;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class GeminiAiService : IAiAssistantService
{
    private static readonly JsonSerializerOptions DtoJsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly AppDbContext _context;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public GeminiAiService(AppDbContext context, HttpClient httpClient, IConfiguration configuration)
    {
        _context = context;
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<IEnumerable<AiParsedTransactionDto>> ParseTransactionsFromTextAsync(string userInput)
    {
        var categories = await _context.Categories
            .Select(c => new { c.Id, c.Name, c.Type })
            .ToListAsync();

        var accounts = await _context.Accounts
            .Select(a => new { a.Id, a.Name, a.Type })
            .ToListAsync();

        // Janela curta (não os 24 meses inteiros de projeção) — "recebi os mil reais"
        // só faz sentido bater com algo próximo de hoje, não uma parcela que só vence
        // daqui a um ano. Só conta pra conta comum (sem cartão): compra de cartão se
        // resolve na tela de Fatura, não por aqui.
        var pendingWindowStart = DateTime.UtcNow.Date.AddDays(-120);
        var pendingWindowEnd = DateTime.UtcNow.Date.AddDays(45);

        var pendingTransactions = await _context.Transactions
            .Where(t =>
                t.Status == TransactionStatus.Pending &&
                t.AccountId != null &&
                t.Date >= pendingWindowStart &&
                t.Date <= pendingWindowEnd)
            .Select(t => new { t.Id, t.Description, t.Amount, t.Type, t.Date })
            .ToListAsync();

        var systemPrompt = BuildSystemPrompt(
            categories.Select(c => (c.Id, c.Name, c.Type.ToString())),
            accounts.Select(a => (a.Id, a.Name, a.Type.ToString())),
            pendingTransactions.Select(t => (t.Id, t.Description, t.Amount, t.Type.ToString(), t.Date)));

        var apiKey = _configuration["Gemini:ApiKey"];
        var model = _configuration["Gemini:Model"] ?? "gemini-2.0-flash";

        var requestBody = new
        {
            system_instruction = new
            {
                parts = new[] { new { text = systemPrompt } }
            },
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[] { new { text = userInput } }
                }
            },
            generationConfig = new
            {
                responseMimeType = "application/json",
                // Sem isso, o "Cada item deve conter exatamente estes campos" do prompt é
                // só uma sugestão — o modelo às vezes omite matchedPendingTransactionId/
                // matchedPendingLabel inteiramente quando não tem nada a dizer sobre eles,
                // em vez de mandar null. Um schema com esses dois campos em "required"
                // (mas nullable) obriga a resposta sempre trazer as duas chaves.
                responseSchema = BuildResponseSchema()
            }
        };

        var response = await _httpClient.PostAsJsonAsync(
            $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}",
            requestBody);

        response.EnsureSuccessStatusCode();

        var geminiResponse = await response.Content.ReadFromJsonAsync<GeminiResponse>();
        var rawText = geminiResponse?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text;

        if (string.IsNullOrWhiteSpace(rawText))
        {
            return [];
        }

        var cleanedJson = StripMarkdownFences(rawText);

        return JsonSerializer.Deserialize<List<AiParsedTransactionDto>>(cleanedJson, DtoJsonOptions) ?? [];
    }

    private static string BuildSystemPrompt(
        IEnumerable<(Guid Id, string Name, string Type)> categories,
        IEnumerable<(Guid Id, string Name, string Type)> accounts,
        IEnumerable<(Guid Id, string Description, decimal Amount, string Type, DateTime Date)> pendingTransactions)
    {
        var categoriesText = string.Join(
            Environment.NewLine,
            categories.Select(c => $"- Id: {c.Id} | Nome: {c.Name} | Tipo: {c.Type}"));

        // Tipo de conta traduzido explicitamente pro português — sem isso, o modelo não
        // necessariamente associa "Checking"/"MealVoucher" com os termos que o usuário
        // realmente usa em fala natural ("conta corrente", "VR"/"vale-refeição").
        var accountsText = string.Join(
            Environment.NewLine,
            accounts.Select(a => $"- Id: {a.Id} | Nome: {a.Name} | Tipo: {TranslateAccountType(a.Type)}"));

        var pendingText = pendingTransactions.Any()
            ? string.Join(
                Environment.NewLine,
                pendingTransactions.Select(t =>
                    $"- Id: {t.Id} | Descrição: {t.Description} | Tipo: {t.Type} | " +
                    $"Valor previsto: {t.Amount.ToString("F2", CultureInfo.InvariantCulture)} | " +
                    $"Data prevista: {t.Date:yyyy-MM-dd}"))
            : "(nenhuma transação pendente nos próximos/últimos dias)";

        var today = DateTime.UtcNow.Date.ToString("yyyy-MM-dd");

        return $"""
            Você é um classificador financeiro. Sua única função é converter descrições em
            linguagem natural de transações financeiras em um array JSON estrito.

            Categorias válidas (use o Id exato de uma delas no campo "categoryId"):
            {categoriesText}

            Contas disponíveis (use o Id exato de uma delas no campo "accountId" SOMENTE
            quando o texto deixar claro qual conta usar — ex: "no Inter", "no VR", "na
            conta corrente", "no vale-refeição"; caso contrário, deixe null):
            {accountsText}

            Transações PENDENTES já cadastradas (podem ser o que o usuário está confirmando
            que aconteceu — ver regra de correspondência abaixo):
            {pendingText}

            Regras obrigatórias:
            - Responda APENAS com um array JSON. Nunca inclua texto explicativo, markdown ou blocos de código.
            - Cada item do array deve conter exatamente estes campos, com esses nomes:
              accountId (Id de uma conta acima se identificável pelo texto, senão null),
              creditCardId (sempre null), categoryId (string, um dos Ids acima),
              subcategoryId (sempre null), type ("Income" ou "Expense"), status (sempre "Pending"),
              amount (número positivo), description (texto curto descrevendo a transação),
              date (data no formato "yyyy-MM-dd"), isFixed (sempre false),
              installmentInfo (sempre null), recurrenceGroupId (sempre null),
              matchedPendingTransactionId (ver regra abaixo), matchedPendingLabel (ver regra abaixo).
            - A data de hoje é {today}. Use essa data quando o usuário não especificar uma data.
            - Se o usuário descrever mais de uma transação na mesma frase, retorne um item por transação.
            - Escolha sempre o Id de uma categoria da lista acima. Nunca invente um Id que não esteja nela.
            - Escolha o Id de uma conta acima só quando o texto realmente indicar qual é —
              nunca chute uma conta ao acaso. Na dúvida, deixe accountId como null.

            Regra de correspondência com pendências:
            - Se o texto do usuário parecer estar CONFIRMANDO algo que já está na lista de
              pendências acima (ex: "recebi os mil reais do Laboclin", "paguei a fatura",
              "chegou o pagamento do freela"), preencha "matchedPendingTransactionId" com o
              Id exato dessa pendência e "matchedPendingLabel" com um resumo curto dela no
              formato "Descrição — R$ Valor previsto" (ex: "Laboclin — R$ 1.000,00").
            - Só faça essa correspondência quando a descrição/contexto for claramente
              compatível com a pendência (mesmo assunto/pessoa/origem) — o valor pode ser
              um pouco diferente do previsto (isso é normal, ex: desconto ou hora extra),
              mas a DESCRIÇÃO tem que fazer sentido junto.
            - Na dúvida, ou se não houver nenhuma pendência claramente relacionada, deixe
              "matchedPendingTransactionId" e "matchedPendingLabel" como null — é sempre
              mais seguro tratar como uma transação nova do que arriscar um vínculo errado.
            - Nunca invente um Id de pendência que não esteja na lista acima.
            """;
    }

    private static JsonObject BuildResponseSchema()
    {
        static JsonObject Prop(string type, bool nullable = false, string[]? enumValues = null)
        {
            var schema = new JsonObject { ["type"] = type };

            if (nullable)
            {
                schema["nullable"] = true;
            }

            if (enumValues is not null)
            {
                schema["enum"] = new JsonArray(enumValues.Select(value => (JsonNode)value).ToArray());
            }

            return schema;
        }

        var properties = new JsonObject
        {
            ["accountId"] = Prop("STRING", nullable: true),
            ["creditCardId"] = Prop("STRING", nullable: true),
            ["categoryId"] = Prop("STRING"),
            ["subcategoryId"] = Prop("STRING", nullable: true),
            ["type"] = Prop("STRING", enumValues: ["Income", "Expense"]),
            ["status"] = Prop("STRING", enumValues: ["Pending"]),
            ["amount"] = Prop("NUMBER"),
            ["description"] = Prop("STRING"),
            ["date"] = Prop("STRING"),
            ["isFixed"] = Prop("BOOLEAN"),
            ["installmentInfo"] = Prop("STRING", nullable: true),
            ["recurrenceGroupId"] = Prop("STRING", nullable: true),
            ["matchedPendingTransactionId"] = Prop("STRING", nullable: true),
            ["matchedPendingLabel"] = Prop("STRING", nullable: true),
        };

        return new JsonObject
        {
            ["type"] = "ARRAY",
            ["items"] = new JsonObject
            {
                ["type"] = "OBJECT",
                ["properties"] = properties,
                ["required"] = new JsonArray(
                    "categoryId", "type", "status", "amount", "description", "date", "isFixed",
                    "matchedPendingTransactionId", "matchedPendingLabel"),
            },
        };
    }

    private static string TranslateAccountType(string type) => type switch
    {
        "Checking" => "Conta Corrente",
        "MealVoucher" => "Vale-Refeição / VR",
        "Savings" => "Poupança",
        _ => type,
    };

    private static string StripMarkdownFences(string text)
    {
        var trimmed = text.Trim();

        if (!trimmed.StartsWith("```"))
        {
            return trimmed;
        }

        var firstLineBreak = trimmed.IndexOf('\n');
        trimmed = firstLineBreak >= 0 ? trimmed[(firstLineBreak + 1)..] : trimmed;

        var closingFenceIndex = trimmed.LastIndexOf("```", StringComparison.Ordinal);
        if (closingFenceIndex >= 0)
        {
            trimmed = trimmed[..closingFenceIndex];
        }

        return trimmed.Trim();
    }

    private record GeminiResponse(
        [property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private record GeminiCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content);

    private record GeminiContent(
        [property: JsonPropertyName("parts")] List<GeminiPart>? Parts);

    private record GeminiPart(
        [property: JsonPropertyName("text")] string? Text);
}
