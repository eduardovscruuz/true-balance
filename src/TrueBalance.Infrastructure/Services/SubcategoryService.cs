using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class SubcategoryService : ISubcategoryService
{
    private readonly AppDbContext _context;

    public SubcategoryService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<SubcategoryDto>> GetAllAsync()
    {
        return await _context.Subcategories
            .Select(s => new SubcategoryDto(s.Id, s.CategoryId, s.Name))
            .ToListAsync();
    }

    public async Task<SubcategoryDto?> GetByIdAsync(Guid id)
    {
        var subcategory = await _context.Subcategories.FindAsync(id);

        return subcategory is null
            ? null
            : new SubcategoryDto(subcategory.Id, subcategory.CategoryId, subcategory.Name);
    }

    public async Task<SubcategoryDto> AddAsync(CreateSubcategoryDto dto)
    {
        var subcategory = new Subcategory
        {
            Id = Guid.NewGuid(),
            CategoryId = dto.CategoryId,
            Name = dto.Name
        };

        _context.Subcategories.Add(subcategory);
        await _context.SaveChangesAsync();

        return new SubcategoryDto(subcategory.Id, subcategory.CategoryId, subcategory.Name);
    }

    public async Task<SubcategoryDto?> UpdateAsync(Guid id, CreateSubcategoryDto dto)
    {
        var subcategory = await _context.Subcategories.FindAsync(id);

        if (subcategory is null)
        {
            return null;
        }

        subcategory.CategoryId = dto.CategoryId;
        subcategory.Name = dto.Name;

        await _context.SaveChangesAsync();

        return new SubcategoryDto(subcategory.Id, subcategory.CategoryId, subcategory.Name);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var subcategory = await _context.Subcategories.FindAsync(id);

        if (subcategory is null)
        {
            return false;
        }

        _context.Subcategories.Remove(subcategory);
        await _context.SaveChangesAsync();

        return true;
    }
}
