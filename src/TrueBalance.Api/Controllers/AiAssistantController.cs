using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Controllers;

[ApiController]
[Route("api/ai")]
public class AiAssistantController : ControllerBase
{
    private readonly IAiAssistantService _aiAssistantService;

    public AiAssistantController(IAiAssistantService aiAssistantService)
    {
        _aiAssistantService = aiAssistantService;
    }

    [HttpPost("parse")]
    public async Task<ActionResult<IEnumerable<CreateTransactionDto>>> Parse([FromBody] AiParseRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest("O campo 'text' é obrigatório.");
        }

        try
        {
            var transactions = await _aiAssistantService.ParseTransactionsFromTextAsync(request.Text);
            return Ok(transactions);
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, $"Falha ao comunicar com a API do Gemini: {ex.Message}");
        }
        catch (JsonException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, $"A IA retornou um formato inesperado: {ex.Message}");
        }
    }
}
