using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

public record TransactionDto(
    Guid Id,
    Guid? AccountId,
    Guid? CreditCardId,
    Guid CategoryId,
    Guid? SubcategoryId,
    TransactionType Type,
    TransactionStatus Status,
    decimal Amount,
    string Description,
    DateTime Date,
    bool IsFixed,
    string? InstallmentInfo,
    Guid? RecurrenceGroupId,
    int? RecurrenceDay,
    DateTime? RecurrenceEndDate,
    int? InstallmentNumber,
    int? TotalInstallments);
