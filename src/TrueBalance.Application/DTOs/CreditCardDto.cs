namespace TrueBalance.Application.DTOs;

public record CreditCardDto(
    Guid Id,
    string Name,
    int ClosingDay,
    int DueDay,
    decimal Limit,
    Guid? PaymentAccountId,
    string? Color,
    string? Icon);
