using Microsoft.AspNetCore.Mvc;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;

    public TransactionsController(ITransactionService transactionService)
    {
        _transactionService = transactionService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TransactionDto>>> GetAll()
    {
        var transactions = await _transactionService.GetAllAsync();
        return Ok(transactions);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TransactionDto>> GetById(Guid id)
    {
        var transaction = await _transactionService.GetByIdAsync(id);
        return transaction is null ? NotFound() : Ok(transaction);
    }

    [HttpPost]
    public async Task<ActionResult<TransactionDto>> Create(CreateTransactionDto dto)
    {
        var created = await _transactionService.AddAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }
}
