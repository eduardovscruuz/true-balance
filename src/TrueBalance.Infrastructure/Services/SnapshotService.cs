using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Domain.Enums;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class SnapshotService : ISnapshotService
{
    private readonly AppDbContext _context;

    public SnapshotService(AppDbContext context)
    {
        _context = context;
    }

    public async Task GenerateMonthlyBalancesAsync(int month, int year)
    {
        var transactions = await _context.Transactions
            .Where(t => t.Status == TransactionStatus.Paid
                     && t.AccountId != null
                     && t.Date.Month == month
                     && t.Date.Year == year)
            .ToListAsync();

        var groups = transactions.GroupBy(t => t.AccountId!.Value);

        foreach (var group in groups)
        {
            var income = group
                .Where(t => t.Type == TransactionType.Income)
                .Sum(t => t.Amount);

            var outflow = group
                .Where(t => t.Type is TransactionType.Expense or TransactionType.Transfer)
                .Sum(t => t.Amount);

            var closingBalance = income - outflow;

            var existingBalance = await _context.MonthlyBalances.FirstOrDefaultAsync(b =>
                b.AccountId == group.Key && b.Month == month && b.Year == year);

            if (existingBalance is null)
            {
                _context.MonthlyBalances.Add(new MonthlyBalance
                {
                    Id = Guid.NewGuid(),
                    AccountId = group.Key,
                    Month = month,
                    Year = year,
                    ClosingBalance = closingBalance
                });
            }
            else
            {
                existingBalance.ClosingBalance = closingBalance;
            }
        }

        await _context.SaveChangesAsync();
    }
}
