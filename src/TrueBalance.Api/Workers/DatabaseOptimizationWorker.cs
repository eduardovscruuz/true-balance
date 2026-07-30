using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Workers;

public class DatabaseOptimizationWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DatabaseOptimizationWorker> _logger;

    public DatabaseOptimizationWorker(IServiceScopeFactory scopeFactory, ILogger<DatabaseOptimizationWorker> logger)
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

                var snapshotService = scope.ServiceProvider.GetRequiredService<ISnapshotService>();
                var cleanupService = scope.ServiceProvider.GetRequiredService<ICleanupService>();

                var lastMonth = DateTime.UtcNow.AddMonths(-1);
                await snapshotService.GenerateMonthlyBalancesAsync(lastMonth.Month, lastMonth.Year);

                await cleanupService.RunDatabaseOptimizationAsync();

                _logger.LogInformation("Otimização de banco de dados executada em {Time}", DateTimeOffset.UtcNow);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha ao executar a otimização de banco de dados.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
