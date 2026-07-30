namespace TrueBalance.Domain.Entities;

public class Subcategory
{
    public Guid Id { get; set; }
    public Guid CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;

    public Category Category { get; set; } = null!;
    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    public ICollection<MonthlySummary> MonthlySummaries { get; set; } = new List<MonthlySummary>();
}
