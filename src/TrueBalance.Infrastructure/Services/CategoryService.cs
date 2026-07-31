using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class CategoryService : ICategoryService
{
    private readonly AppDbContext _context;

    public CategoryService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<CategoryDto>> GetAllAsync()
    {
        return await _context.Categories
            .Select(c => new CategoryDto(c.Id, c.Name, c.Type, c.Color, c.Icon))
            .ToListAsync();
    }

    public async Task<CategoryDto?> GetByIdAsync(Guid id)
    {
        var category = await _context.Categories.FindAsync(id);

        return category is null
            ? null
            : new CategoryDto(category.Id, category.Name, category.Type, category.Color, category.Icon);
    }

    public async Task<CategoryDto> AddAsync(CreateCategoryDto dto)
    {
        var category = new Category
        {
            Id = Guid.NewGuid(),
            Name = dto.Name,
            Type = dto.Type,
            Color = dto.Color,
            Icon = dto.Icon
        };

        _context.Categories.Add(category);
        await _context.SaveChangesAsync();

        return new CategoryDto(category.Id, category.Name, category.Type, category.Color, category.Icon);
    }

    public async Task<CategoryDto?> UpdateAsync(Guid id, CreateCategoryDto dto)
    {
        var category = await _context.Categories.FindAsync(id);

        if (category is null)
        {
            return null;
        }

        category.Name = dto.Name;
        category.Type = dto.Type;
        category.Color = dto.Color;
        category.Icon = dto.Icon;

        await _context.SaveChangesAsync();

        return new CategoryDto(category.Id, category.Name, category.Type, category.Color, category.Icon);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var category = await _context.Categories.FindAsync(id);

        if (category is null)
        {
            return false;
        }

        _context.Categories.Remove(category);
        await _context.SaveChangesAsync();

        return true;
    }
}
