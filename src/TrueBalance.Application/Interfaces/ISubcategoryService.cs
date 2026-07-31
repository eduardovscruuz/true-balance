using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface ISubcategoryService
{
    Task<IEnumerable<SubcategoryDto>> GetAllAsync();
    Task<SubcategoryDto?> GetByIdAsync(Guid id);
    Task<SubcategoryDto> AddAsync(CreateSubcategoryDto dto);
    Task<SubcategoryDto?> UpdateAsync(Guid id, CreateSubcategoryDto dto);
    Task<bool> DeleteAsync(Guid id);
}
