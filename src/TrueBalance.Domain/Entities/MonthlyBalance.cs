namespace TrueBalance.Domain.Entities;

public class MonthlyBalance
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public int Month { get; set; }
    public int Year { get; set; }
    public decimal ClosingBalance { get; set; }

    public Account Account { get; set; } = null!;
}
