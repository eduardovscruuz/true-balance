namespace TrueBalance.Application.Interfaces;

public interface ICleanupService
{
    Task RunDatabaseOptimizationAsync();
}
