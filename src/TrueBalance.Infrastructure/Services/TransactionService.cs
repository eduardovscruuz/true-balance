using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Domain.Enums;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class TransactionService : ITransactionService
{
    private readonly AppDbContext _context;
    private readonly IProjectionService _projectionService;

    public TransactionService(AppDbContext context, IProjectionService projectionService)
    {
        _context = context;
        _projectionService = projectionService;
    }

    public async Task<IEnumerable<TransactionDto>> GetAllAsync()
    {
        var transactions = await _context.Transactions
            .Include(t => t.Account)
            .Include(t => t.CreditCard)
            .Include(t => t.Category)
            .Include(t => t.Subcategory)
            .ToListAsync();

        return transactions.Select(MapToDto);
    }

    public async Task<TransactionDto?> GetByIdAsync(Guid id)
    {
        var transaction = await _context.Transactions
            .Include(t => t.Account)
            .Include(t => t.CreditCard)
            .Include(t => t.Category)
            .Include(t => t.Subcategory)
            .FirstOrDefaultAsync(t => t.Id == id);

        return transaction is null ? null : MapToDto(transaction);
    }

    public async Task<IEnumerable<TransactionDto>> GetByMonthAsync(int year, int month)
    {
        var transactions = await _context.Transactions
            .Include(t => t.Account)
            .Include(t => t.CreditCard)
            .Include(t => t.Category)
            .Include(t => t.Subcategory)
            .Where(t => t.Date.Year == year && t.Date.Month == month)
            .ToListAsync();

        return transactions.Select(MapToDto);
    }

    public async Task<TransactionDto> AddAsync(CreateTransactionDto dto)
    {
        // Reaproveita ApplyDto (usado por Update/UpdateSeries também) em vez de duplicar
        // a lista de campos aqui — evita o tipo de bug em que um campo novo (ex: PaidDate)
        // é adicionado num lugar só e fica esquecido no outro.
        var transaction = new Transaction { Id = Guid.NewGuid() };
        ApplyDto(transaction, dto);

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

        await ProjectIfRecurringAsync(dto);

        return MapToDto(transaction);
    }

    public async Task<TransactionDto?> UpdateAsync(Guid id, CreateTransactionDto dto)
    {
        var transaction = await _context.Transactions.FindAsync(id);

        if (transaction is null)
        {
            return null;
        }

        ApplyDto(transaction, dto);
        await _context.SaveChangesAsync();

        await ProjectIfRecurringAsync(dto);

        return MapToDto(transaction);
    }

    // "Salvar esta e todas as pendentes PRA FRENTE" — ex: reajuste de mensalidade que deve
    // valer dessa ocorrência em diante. Atualiza ESTA transação por completo (igual
    // UpdateAsync) e propaga só os campos "de template" (valor, descrição, categoria,
    // conta, etc.) pras PENDENTES da mesma série com Date >= a desta ocorrência — nunca
    // pra trás (uma pendente mais antiga, ex: paga fora de ordem, fica intocada) — e nunca
    // toca na Date, no Status ou no InstallmentNumber de cada uma, específicos de cada ocorrência.
    public async Task<TransactionDto?> UpdateSeriesAsync(Guid id, CreateTransactionDto dto)
    {
        var transaction = await _context.Transactions.FindAsync(id);

        if (transaction is null)
        {
            return null;
        }

        ApplyDto(transaction, dto);

        if (transaction.RecurrenceGroupId is Guid groupId)
        {
            var pendingSiblings = await _context.Transactions
                .Where(t => t.RecurrenceGroupId == groupId
                    && t.Status == TransactionStatus.Pending
                    && t.Date >= transaction.Date
                    && t.Id != id)
                .ToListAsync();

            // Parcelado (TotalInstallments setado): todas as parcelas são pedaços da MESMA
            // compra física — compartilham a mesma PurchaseDate (diferente de uma despesa
            // FIXA, onde cada mês é um fato novo, uma conta nova chegando, sem "a" data de
            // compra única fazendo sentido de propagar). Editar a Data da Compra desta
            // ocorrência propaga o mesmo valor pras próximas pendentes, e o Vencimento
            // (Date) de cada uma é recalculado a partir dali, deslocado pelo número da
            // parcela — igual seria calculado na criação (ver computeCreditCardInvoice no
            // front-end) — porque mudar a Data da Compra pode empurrar a compra inteira pra
            // outra fatura (ex: lançou atrasado, a compra na verdade é do mês anterior).
            // O deslocamento é sempre relativo à parcela 1 (InstallmentNumber - 1), não à
            // parcela que foi editada — dá no mesmo quando se edita a 1ª, mas continua
            // certo editando qualquer outra: a PurchaseDate digitada representa sempre a
            // mesma compra original única, não "a data desta parcela em si".
            var creditCard = dto.CreditCardId is Guid creditCardId && dto.TotalInstallments.HasValue && dto.PurchaseDate.HasValue
                ? await _context.CreditCards.FindAsync(creditCardId)
                : null;

            foreach (var sibling in pendingSiblings)
            {
                sibling.AccountId = dto.AccountId;
                sibling.CreditCardId = dto.CreditCardId;
                sibling.CategoryId = dto.CategoryId;
                sibling.SubcategoryId = dto.SubcategoryId;
                sibling.Type = dto.Type;
                sibling.Amount = dto.Amount;
                sibling.Description = dto.Description;
                sibling.RecurrenceDay = dto.RecurrenceDay;
                sibling.RecurrenceEndDate = NormalizeToUtc(dto.RecurrenceEndDate);
                sibling.TotalInstallments = dto.TotalInstallments;

                if (creditCard is not null && sibling.InstallmentNumber.HasValue)
                {
                    var purchaseDate = NormalizeToUtc(dto.PurchaseDate!.Value);
                    var monthOffset = sibling.InstallmentNumber.Value - 1;

                    sibling.PurchaseDate = purchaseDate;
                    sibling.Date = ComputeCreditCardDueDate(purchaseDate, creditCard.ClosingDay, creditCard.DueDay, monthOffset);
                }
            }
        }

        await _context.SaveChangesAsync();

        await ProjectIfRecurringAsync(dto);

        return MapToDto(transaction);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var transaction = await _context.Transactions.FindAsync(id);

        if (transaction is null)
        {
            return false;
        }

        _context.Transactions.Remove(transaction);
        await _context.SaveChangesAsync();

        return true;
    }

    public async Task<bool> DeleteSeriesAsync(Guid id)
    {
        var transaction = await _context.Transactions.FindAsync(id);

        if (transaction is null)
        {
            return false;
        }

        // "Excluir esta e as próximas pendentes PRA FRENTE" — só remove as PENDENTES da
        // mesma série com Date >= a desta (nunca as já pagas, fatos históricos já
        // ocorridos, e nunca uma pendente mais antiga que porventura ainda exista pra trás).
        if (transaction.RecurrenceGroupId is Guid groupId)
        {
            var seriesTransactions = await _context.Transactions
                .Where(t => t.RecurrenceGroupId == groupId && t.Id != id)
                .ToListAsync();

            var pendingInSeries = seriesTransactions
                .Where(t => t.Status == TransactionStatus.Pending && t.Date >= transaction.Date)
                .ToList();

            _context.Transactions.RemoveRange(pendingInSeries);

            // Sem isso, ProjectFixedExpensesAsync (roda no startup, a cada 24h, e em toda
            // criação/edição de QUALQUER transação fixa/parcelada — ver ProjectIfRecurringAsync)
            // ressuscita essas ocorrências: ela olha só "existe uma transação nesse grupo,
            // até onde o RecurrenceEndDate dela permite gerar?", sem nenhum sinal de que o
            // usuário acabou de excluir a série a partir daqui de propósito. Grava o corte
            // em TODAS as que sobraram (não só a mais recente) — a projeção usa a de maior
            // Date pra decidir, mas deixar todas consistentes evita esse mesmo bug
            // reaparecer se uma dessas for editada depois.
            var remainingInSeries = seriesTransactions.Except(pendingInSeries);
            var cutoffMonth = transaction.Date.AddMonths(-1);

            foreach (var sibling in remainingInSeries)
            {
                sibling.RecurrenceEndDate = cutoffMonth;
            }
        }

        _context.Transactions.Remove(transaction);
        await _context.SaveChangesAsync();

        return true;
    }

    // Usado pelo seletor de mês global (barra de navegação) pra saber até onde dá
    // pra voltar — não filtra por conta, já que o seletor afeta todas as telas juntas.
    public async Task<DateTime?> GetEarliestDateAsync()
    {
        return await _context.Transactions
            .OrderBy(t => t.Date)
            .Select(t => (DateTime?)t.Date)
            .FirstOrDefaultAsync();
    }

    // Uma fatura de cartão é um fato único: paga ou não, nunca "meio paga" — então marcar
    // como Paga/Pendente atualiza TODAS as transações daquele cartão que caem naquele mês
    // (o mesmo mês em que a fatura vence, já que é isso que fica salvo em Date), de uma vez.
    // Marcar como Paga também registra PaidDate = hoje — Date continua sendo o VENCIMENTO
    // (útil pra saber de qual fatura é), mas PaidDate é quando o dinheiro realmente saiu,
    // que pode ser antes ou depois do vencimento (ex: pagou adiantado).
    public async Task<int> SetInvoiceStatusAsync(Guid creditCardId, int year, int month, TransactionStatus status, DateTime? paidDate)
    {
        var transactions = await _context.Transactions
            .Where(t => t.CreditCardId == creditCardId && t.Date.Year == year && t.Date.Month == month)
            .ToListAsync();

        // Sem data informada (ex: chamada antiga), cai em hoje — mas o normal é vir
        // explícita, pra dar pra registrar um pagamento retroativo (ex: histórico).
        var resolvedPaidDate = status == TransactionStatus.Paid
            ? NormalizeToUtc(paidDate ?? DateTime.UtcNow.Date)
            : (DateTime?)null;

        foreach (var transaction in transactions)
        {
            transaction.Status = status;
            transaction.PaidDate = resolvedPaidDate;
        }

        await _context.SaveChangesAsync();

        return transactions.Count;
    }

    // O worker de projeção (FixedExpenseProjectionWorker) só roda na inicialização da API
    // e depois a cada 24h — sem isso aqui, uma despesa fixa/parcelada recém-criada ou
    // editada só apareceria nos meses seguintes até 24h depois, não imediatamente. Chama
    // a projeção completa (não só desta transação) pra também recuperar qualquer atraso
    // natural do relógio desde a última execução do worker.
    private async Task ProjectIfRecurringAsync(CreateTransactionDto dto)
    {
        if (dto.IsFixed || dto.TotalInstallments.HasValue)
        {
            await _projectionService.ProjectFixedExpensesAsync(CancellationToken.None);
        }
    }

    private static void ApplyDto(Transaction transaction, CreateTransactionDto dto)
    {
        transaction.AccountId = dto.AccountId;
        transaction.CreditCardId = dto.CreditCardId;
        transaction.CategoryId = dto.CategoryId;
        transaction.SubcategoryId = dto.SubcategoryId;
        transaction.Type = dto.Type;
        transaction.Status = dto.Status;
        transaction.Amount = dto.Amount;
        transaction.Description = dto.Description;
        transaction.Date = NormalizeToUtc(dto.Date);
        transaction.IsFixed = dto.IsFixed;
        transaction.InstallmentInfo = dto.InstallmentInfo;
        transaction.RecurrenceGroupId = dto.RecurrenceGroupId;
        transaction.RecurrenceDay = dto.RecurrenceDay;
        transaction.RecurrenceEndDate = NormalizeToUtc(dto.RecurrenceEndDate);
        transaction.InstallmentNumber = dto.InstallmentNumber;
        transaction.TotalInstallments = dto.TotalInstallments;
        // PaidDate só faz sentido pra fatura de cartão (janela entre compra e vencimento
        // em que o pagamento pode acontecer) — numa transação comum, Date já É o dia em
        // que foi paga, então guardar os dois seria uma informação redundante/duplicada.
        transaction.PaidDate = dto.CreditCardId is null ? null : NormalizeToUtc(dto.PaidDate);
        // PurchaseDate (dia real da compra) também só existe pra cartão — Date, nesse
        // caso, guarda o VENCIMENTO da fatura (calculado a partir da compra + fechamento
        // do cartão), não o dia da compra em si.
        transaction.PurchaseDate = dto.CreditCardId is null ? null : NormalizeToUtc(dto.PurchaseDate);
    }

    // Mesma lógica de "computeCreditCardInvoice" do formulário no front-end (ver
    // transaction-form.ts) — uma compra pertence à fatura que fecha DEPOIS dela; o
    // vencimento fica no mesmo mês do fechamento se o dia de vencimento do cartão vier
    // depois do dia de fechamento, senão no mês seguinte ao fechamento. monthOffset desloca
    // o resultado N meses pra frente, usado pra recalcular o vencimento de uma parcela
    // específica (não a 1ª) a partir da mesma data de compra da parcela âncora.
    private static DateTime ComputeCreditCardDueDate(DateTime purchaseDate, int closingDay, int dueDay, int monthOffset)
    {
        var closingMonthIndex = (purchaseDate.Year * 12) + (purchaseDate.Month - 1);

        if (purchaseDate.Day > closingDay)
        {
            closingMonthIndex += 1;
        }

        closingMonthIndex += monthOffset;

        var dueMonthIndex = closingMonthIndex;

        if (dueDay <= closingDay)
        {
            dueMonthIndex += 1;
        }

        var dueYear = dueMonthIndex / 12;
        var dueMonth = (dueMonthIndex % 12) + 1;
        var clampedDueDay = Math.Min(dueDay, DateTime.DaysInMonth(dueYear, dueMonth));

        return new DateTime(dueYear, dueMonth, clampedDueDay, 0, 0, 0, DateTimeKind.Utc);
    }

    // Npgsql exige DateTime.Kind = Utc para colunas "timestamp with time zone" — se o cliente
    // mandar uma data sem informação de fuso (ex: "2026-07-30", como o <input type="date"> do
    // Angular ou o parser de IA da Fase 7 enviam), o System.Text.Json desserializa como
    // Kind=Unspecified, e o SaveChangesAsync quebra com uma exceção só em runtime.
    private static DateTime NormalizeToUtc(DateTime date) =>
        date.Kind == DateTimeKind.Utc ? date : DateTime.SpecifyKind(date, DateTimeKind.Utc);

    private static DateTime? NormalizeToUtc(DateTime? date) => date.HasValue ? NormalizeToUtc(date.Value) : null;

    private static TransactionDto MapToDto(Transaction t) => new(
        t.Id,
        t.AccountId,
        t.CreditCardId,
        t.CategoryId,
        t.SubcategoryId,
        t.Type,
        t.Status,
        t.Amount,
        t.Description,
        t.Date,
        t.IsFixed,
        t.InstallmentInfo,
        t.RecurrenceGroupId,
        t.RecurrenceDay,
        t.RecurrenceEndDate,
        t.InstallmentNumber,
        t.TotalInstallments,
        t.PaidDate,
        t.PurchaseDate);
}
