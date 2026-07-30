using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

public record MonthlySummaryDto(
    Guid Id,
    int Month,
    int Year,
    Guid CategoryId,
    Guid? SubcategoryId,
    decimal TotalAmount,
    CategoryType Type);
