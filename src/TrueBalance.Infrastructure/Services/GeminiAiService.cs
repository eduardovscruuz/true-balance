using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
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

    public async Task<IEnumerable<CreateTransactionDto>> ParseTransactionsFromTextAsync(string userInput)
    {
        var categories = await _context.Categories
            .Select(c => new { c.Id, c.Name, c.Type })
            .ToListAsync();

        var systemPrompt = BuildSystemPrompt(categories.Select(c => (c.Id, c.Name, c.Type.ToString())));

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
                responseMimeType = "application/json"
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

        return JsonSerializer.Deserialize<List<CreateTransactionDto>>(cleanedJson, DtoJsonOptions) ?? [];
    }

    private static string BuildSystemPrompt(IEnumerable<(Guid Id, string Name, string Type)> categories)
    {
        var categoriesText = string.Join(
            Environment.NewLine,
            categories.Select(c => $"- Id: {c.Id} | Nome: {c.Name} | Tipo: {c.Type}"));

        var today = DateTime.UtcNow.Date.ToString("yyyy-MM-dd");

        return $"""
            Você é um classificador financeiro. Sua única função é converter descrições em
            linguagem natural de transações financeiras em um array JSON estrito.

            Categorias válidas (use o Id exato de uma delas no campo "categoryId"):
            {categoriesText}

            Regras obrigatórias:
            - Responda APENAS com um array JSON. Nunca inclua texto explicativo, markdown ou blocos de código.
            - Cada item do array deve conter exatamente estes campos, com esses nomes:
              accountId (sempre null), creditCardId (sempre null), categoryId (string, um dos Ids acima),
              subcategoryId (sempre null), type ("Income" ou "Expense"), status (sempre "Pending"),
              amount (número positivo), description (texto curto descrevendo a transação),
              date (data no formato "yyyy-MM-dd"), isFixed (sempre false),
              installmentInfo (sempre null), recurrenceGroupId (sempre null).
            - A data de hoje é {today}. Use essa data quando o usuário não especificar uma data.
            - Se o usuário descrever mais de uma transação na mesma frase, retorne um item por transação.
            - Escolha sempre o Id de uma categoria da lista acima. Nunca invente um Id que não esteja nela.
            """;
    }

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
