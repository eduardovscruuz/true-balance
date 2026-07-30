using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
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
            Date = dto.Date,
            IsFixed = dto.IsFixed,
            InstallmentInfo = dto.InstallmentInfo,
            RecurrenceGroupId = dto.RecurrenceGroupId
        };

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

        return MapToDto(transaction);
    }

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
        t.RecurrenceGroupId);
}
