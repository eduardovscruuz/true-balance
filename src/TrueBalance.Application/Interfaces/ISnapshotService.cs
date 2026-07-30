namespace TrueBalance.Application.Interfaces;

public interface ISnapshotService
{
    Task GenerateMonthlyBalancesAsync(int month, int year);
}
