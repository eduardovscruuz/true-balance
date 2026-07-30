namespace TrueBalance.Application.Interfaces;

public interface IProjectionService
{
    Task ProjectFixedExpensesAsync(CancellationToken stoppingToken);
}
