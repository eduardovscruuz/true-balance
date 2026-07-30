using TrueBalance.Domain.Enums;

namespace TrueBalance.Domain.Entities;

public class Transaction
{
    public Guid Id { get; set; }
    public Guid? AccountId { get; set; }
    public Guid? CreditCardId { get; set; }
    public Guid CategoryId { get; set; }
    public Guid? SubcategoryId { get; set; }
    public TransactionType Type { get; set; }
    public TransactionStatus Status { get; set; }
    public decimal Amount { get; set; }
    public string Description { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public bool IsFixed { get; set; }
    public string? InstallmentInfo { get; set; }
    public Guid? RecurrenceGroupId { get; set; }

    public Account? Account { get; set; }
    public CreditCard? CreditCard { get; set; }
    public Category Category { get; set; } = null!;
    public Subcategory? Subcategory { get; set; }
}
