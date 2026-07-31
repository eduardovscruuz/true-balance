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

    public TransactionService(AppDbContext context)
    {
        _context = context;
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
        var transaction = new Transaction
        {
            Id = Guid.NewGuid(),
            AccountId = dto.AccountId,
            CreditCardId = dto.CreditCardId,
            CategoryId = dto.CategoryId,
            SubcategoryId = dto.SubcategoryId,
            Type = dto.Type,
            Status = dto.Status,
            Amount = dto.Amount,
            Description = dto.Description,
            Date = NormalizeToUtc(dto.Date),
            IsFixed = dto.IsFixed,
            InstallmentInfo = dto.InstallmentInfo,
            RecurrenceGroupId = dto.RecurrenceGroupId,
            RecurrenceDay = dto.RecurrenceDay,
            RecurrenceEndDate = NormalizeToUtc(dto.RecurrenceEndDate),
            InstallmentNumber = dto.InstallmentNumber,
            TotalInstallments = dto.TotalInstallments
        };

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

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
            }
        }

        await _context.SaveChangesAsync();

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
            var pendingInSeries = await _context.Transactions
                .Where(t => t.RecurrenceGroupId == groupId
                    && t.Status == TransactionStatus.Pending
                    && t.Date >= transaction.Date
                    && t.Id != id)
                .ToListAsync();

            _context.Transactions.RemoveRange(pendingInSeries);
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
    public async Task<int> SetInvoiceStatusAsync(Guid creditCardId, int year, int month, TransactionStatus status)
    {
        var transactions = await _context.Transactions
            .Where(t => t.CreditCardId == creditCardId && t.Date.Year == year && t.Date.Month == month)
            .ToListAsync();

        foreach (var transaction in transactions)
        {
            transaction.Status = status;
        }

        await _context.SaveChangesAsync();

        return transactions.Count;
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
        t.TotalInstallments);
}
