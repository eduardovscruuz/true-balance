namespace TrueBalance.Application.DTOs;

public record CreateCreditCardDto(string Name, int ClosingDay, int DueDay, decimal Limit, Guid? PaymentAccountId);
