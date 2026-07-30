namespace TrueBalance.Application.DTOs;

public record AccountDto(Guid Id, string Name, string Type, decimal Balance, DateTime CreatedAt);
