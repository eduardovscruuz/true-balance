using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface IReportService
{
    Task<IEnumerable<MonthlyBalanceDto>> GetBalancesByYearAsync(int year);
    Task<IEnumerable<MonthlySummaryDto>> GetSummariesByMonthAsync(int month, int year);
}
