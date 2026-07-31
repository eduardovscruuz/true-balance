using Microsoft.AspNetCore.Mvc;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CreditCardsController : ControllerBase
{
    private readonly ICreditCardService _creditCardService;

    public CreditCardsController(ICreditCardService creditCardService)
    {
        _creditCardService = creditCardService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CreditCardDto>>> GetAll()
    {
        var creditCards = await _creditCardService.GetAllAsync();
        return Ok(creditCards);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CreditCardDto>> GetById(Guid id)
    {
        var creditCard = await _creditCardService.GetByIdAsync(id);
        return creditCard is null ? NotFound() : Ok(creditCard);
    }

    [HttpPost]
    public async Task<ActionResult<CreditCardDto>> Create(CreateCreditCardDto dto)
    {
        var created = await _creditCardService.AddAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CreditCardDto>> Update(Guid id, CreateCreditCardDto dto)
    {
        var updated = await _creditCardService.UpdateAsync(id, dto);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var deleted = await _creditCardService.DeleteAsync(id);
        return deleted ? NoContent() : NotFound();
    }
}
