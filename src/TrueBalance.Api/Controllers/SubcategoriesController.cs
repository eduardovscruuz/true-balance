using Microsoft.AspNetCore.Mvc;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SubcategoriesController : ControllerBase
{
    private readonly ISubcategoryService _subcategoryService;

    public SubcategoriesController(ISubcategoryService subcategoryService)
    {
        _subcategoryService = subcategoryService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<SubcategoryDto>>> GetAll()
    {
        var subcategories = await _subcategoryService.GetAllAsync();
        return Ok(subcategories);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SubcategoryDto>> GetById(Guid id)
    {
        var subcategory = await _subcategoryService.GetByIdAsync(id);
        return subcategory is null ? NotFound() : Ok(subcategory);
    }

    [HttpPost]
    public async Task<ActionResult<SubcategoryDto>> Create(CreateSubcategoryDto dto)
    {
        var created = await _subcategoryService.AddAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }
}
