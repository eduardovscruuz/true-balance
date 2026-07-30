namespace TrueBalance.Domain.Entities;

public class CreditCard
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int ClosingDay { get; set; }
    public int DueDay { get; set; }
    public decimal Limit { get; set; }

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}
