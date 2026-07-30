using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

public record CreateCategoryDto(string Name, CategoryType Type, string Color, string Icon);
