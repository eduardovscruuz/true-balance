using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Domain.Enums;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class CleanupService : ICleanupService
{
    private const int RollupThresholdMonths = 3;
    private const int PurgeThresholdMonths = 12;

    private readonly AppDbContext _context;

    public CleanupService(AppDbContext context)
    {
        _context = context;
    }

    public async Task RunDatabaseOptimizationAsync()
    {
        await using var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            await RollupOldTransactionsAsync();
            await _context.SaveChangesAsync();

            // Flush antes do purge: um summary recém-criado pelo rollup pode já estar
            // fora da janela de 12 meses, e o purge consulta o banco diretamente.
            await PurgeOldSummariesAsync();
            await _context.SaveChangesAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private async Task RollupOldTransactionsAsync()
    {
        var rollupCutoff = DateTime.UtcNow.AddMonths(-RollupThresholdMonths);

        var oldTransactions = await _context.Transactions
            .Where(t => t.Status == TransactionStatus.Paid && t.Date < rollupCutoff)
            .ToListAsync();

        if (oldTransactions.Count == 0)
        {
            return;
        }

        var categoryTypes = await _context.Categories
            .Select(c => new { c.Id, c.Type })
            .ToDictionaryAsync(c => c.Id, c => c.Type);

        var rollupGroups = oldTransactions.GroupBy(t => new
        {
            t.CategoryId,
            t.SubcategoryId,
            Month = t.Date.Month,
            Year = t.Date.Year
        });

        foreach (var group in rollupGroups)
        {
            var totalAmount = group.Sum(t => t.Amount);

            var existingSummary = await _context.MonthlySummaries.FirstOrDefaultAsync(s =>
                s.CategoryId == group.Key.CategoryId
                && s.SubcategoryId == group.Key.SubcategoryId
                && s.Month == group.Key.Month
                && s.Year == group.Key.Year);

            if (existingSummary is null)
            {
                _context.MonthlySummaries.Add(new MonthlySummary
                {
                    Id = Guid.NewGuid(),
                    CategoryId = group.Key.CategoryId,
                    SubcategoryId = group.Key.SubcategoryId,
                    Month = group.Key.Month,
                    Year = group.Key.Year,
                    TotalAmount = totalAmount,
                    Type = categoryTypes[group.Key.CategoryId]
                });
            }
            else
            {
                existingSummary.TotalAmount += totalAmount;
            }
        }

        _context.Transactions.RemoveRange(oldTransactions);
    }

    private async Task PurgeOldSummariesAsync()
    {
        var purgeCutoff = DateTime.UtcNow.AddMonths(-PurgeThresholdMonths);
        var purgeCutoffKey = (purgeCutoff.Year * 100) + purgeCutoff.Month;

        var summariesToPurge = await _context.MonthlySummaries
            .Where(s => (s.Year * 100) + s.Month < purgeCutoffKey)
            .ToListAsync();

        if (summariesToPurge.Count == 0)
        {
            return;
        }

        _context.MonthlySummaries.RemoveRange(summariesToPurge);
    }
}
