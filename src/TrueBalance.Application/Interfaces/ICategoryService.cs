using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface ICategoryService
{
    Task<IEnumerable<CategoryDto>> GetAllAsync();
    Task<CategoryDto?> GetByIdAsync(Guid id);
    Task<CategoryDto> AddAsync(CreateCategoryDto dto);
}
