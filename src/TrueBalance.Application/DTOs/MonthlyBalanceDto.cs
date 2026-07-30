namespace TrueBalance.Application.DTOs;

public record MonthlyBalanceDto(Guid Id, Guid AccountId, int Month, int Year, decimal ClosingBalance);
