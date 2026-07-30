using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Domain.Enums;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class ProjectionService : IProjectionService
{
    private const int ProjectionWindowMonths = 24;

    private readonly AppDbContext _context;

    public ProjectionService(AppDbContext context)
    {
        _context = context;
    }

    public async Task ProjectFixedExpensesAsync(CancellationToken stoppingToken)
    {
        var fixedTransactions = await _context.Transactions
            .Where(t => t.IsFixed && t.RecurrenceGroupId != null)
            .ToListAsync(stoppingToken);

        var deadline = DateTime.UtcNow.AddMonths(ProjectionWindowMonths);
        var newTransactions = new List<Transaction>();

        var groups = fixedTransactions.GroupBy(t => t.RecurrenceGroupId);

        foreach (var group in groups)
        {
            var lastTransaction = group.OrderByDescending(t => t.Date).First();
            var nextDate = lastTransaction.Date.AddMonths(1);

            while (nextDate < deadline)
            {
                newTransactions.Add(new Transaction
                {
                    Id = Guid.NewGuid(),
                    AccountId = lastTransaction.AccountId,
                    CreditCardId = lastTransaction.CreditCardId,
                    CategoryId = lastTransaction.CategoryId,
                    SubcategoryId = lastTransaction.SubcategoryId,
                    Type = lastTransaction.Type,
                    Status = TransactionStatus.Pending,
                    Amount = lastTransaction.Amount,
                    Description = lastTransaction.Description,
                    Date = nextDate,
                    IsFixed = true,
                    InstallmentInfo = lastTransaction.InstallmentInfo,
                    RecurrenceGroupId = lastTransaction.RecurrenceGroupId
                });

                nextDate = nextDate.AddMonths(1);
            }
        }

        if (newTransactions.Count == 0)
        {
            return;
        }

        _context.Transactions.AddRange(newTransactions);
        await _context.SaveChangesAsync(stoppingToken);
    }
}
