using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

public record CreateAccountDto(string Name, AccountType Type, string Color, decimal Balance);
