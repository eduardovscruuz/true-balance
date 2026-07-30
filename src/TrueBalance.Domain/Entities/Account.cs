namespace TrueBalance.Domain.Entities;

public class Account
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public decimal Balance { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    public ICollection<MonthlyBalance> MonthlyBalances { get; set; } = new List<MonthlyBalance>();
}
