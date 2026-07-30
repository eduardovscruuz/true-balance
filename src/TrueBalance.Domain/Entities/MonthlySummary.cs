using TrueBalance.Domain.Enums;

namespace TrueBalance.Domain.Entities;

public class MonthlySummary
{
    public Guid Id { get; set; }
    public int Month { get; set; }
    public int Year { get; set; }
    public Guid CategoryId { get; set; }
    public Guid? SubcategoryId { get; set; }
    public decimal TotalAmount { get; set; }
    public CategoryType Type { get; set; }

    public Category Category { get; set; } = null!;
    public Subcategory? Subcategory { get; set; }
}
