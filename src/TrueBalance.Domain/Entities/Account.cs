using TrueBalance.Domain.Enums;

namespace TrueBalance.Domain.Entities;

public class Account
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public AccountType Type { get; set; }
    public string Color { get; set; } = "#3B82F6";
    public decimal Balance { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    public ICollection<MonthlyBalance> MonthlyBalances { get; set; } = new List<MonthlyBalance>();
}
