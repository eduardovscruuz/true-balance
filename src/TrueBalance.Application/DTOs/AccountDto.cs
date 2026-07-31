using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

public record AccountDto(
    Guid Id,
    string Name,
    AccountType Type,
    string Color,
    decimal Balance,
    decimal CurrentBalance,
    DateTime CreatedAt);
