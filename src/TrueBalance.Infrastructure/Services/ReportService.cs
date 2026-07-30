using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class ReportService : IReportService
{
    private readonly AppDbContext _context;

    public ReportService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<MonthlyBalanceDto>> GetBalancesByYearAsync(int year)
    {
        return await _context.MonthlyBalances
            .Where(b => b.Year == year)
            .OrderBy(b => b.Month)
            .Select(b => new MonthlyBalanceDto(b.Id, b.AccountId, b.Month, b.Year, b.ClosingBalance))
            .ToListAsync();
    }

    public async Task<IEnumerable<MonthlySummaryDto>> GetSummariesByMonthAsync(int month, int year)
    {
        return await _context.MonthlySummaries
            .Where(s => s.Month == month && s.Year == year)
            .Select(s => new MonthlySummaryDto(s.Id, s.Month, s.Year, s.CategoryId, s.SubcategoryId, s.TotalAmount, s.Type))
            .ToListAsync();
    }
}
