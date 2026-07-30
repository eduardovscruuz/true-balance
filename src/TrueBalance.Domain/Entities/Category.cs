using TrueBalance.Domain.Enums;

namespace TrueBalance.Domain.Entities;

public class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public CategoryType Type { get; set; }
    public string Color { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;

    public ICollection<Subcategory> Subcategories { get; set; } = new List<Subcategory>();
    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
    public ICollection<MonthlySummary> MonthlySummaries { get; set; } = new List<MonthlySummary>();
}
