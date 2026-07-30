using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

public record CategoryDto(Guid Id, string Name, CategoryType Type, string Color, string Icon);
