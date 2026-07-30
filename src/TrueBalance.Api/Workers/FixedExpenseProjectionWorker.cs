using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Workers;

public class FixedExpenseProjectionWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FixedExpenseProjectionWorker> _logger;

    public FixedExpenseProjectionWorker(IServiceScopeFactory scopeFactory, ILogger<FixedExpenseProjectionWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        do
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var projectionService = scope.ServiceProvider.GetRequiredService<IProjectionService>();
                await projectionService.ProjectFixedExpensesAsync(stoppingToken);

                _logger.LogInformation("Projeção de despesas fixas executada em {Time}", DateTimeOffset.UtcNow);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao executar a projeção de despesas fixas.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
