using Microsoft.AspNetCore.Mvc;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportsController : ControllerBase
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    [HttpGet("balances/{year:int}")]
    public async Task<ActionResult<IEnumerable<MonthlyBalanceDto>>> GetBalances(int year)
    {
        var balances = await _reportService.GetBalancesByYearAsync(year);
        return Ok(balances);
    }

    [HttpGet("summaries/{year:int}/{month:int}")]
    public async Task<ActionResult<IEnumerable<MonthlySummaryDto>>> GetSummaries(int year, int month)
    {
        var summaries = await _reportService.GetSummariesByMonthAsync(month, year);
        return Ok(summaries);
    }
}
