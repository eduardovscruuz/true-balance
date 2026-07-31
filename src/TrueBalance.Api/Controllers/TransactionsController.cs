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

    [HttpGet("{year:int}/{month:int}")]
    public async Task<ActionResult<IEnumerable<TransactionDto>>> GetByMonth(int year, int month)
    {
        var transactions = await _transactionService.GetByMonthAsync(year, month);
        return Ok(transactions);
    }

    [HttpPost]
    public async Task<ActionResult<TransactionDto>> Create(CreateTransactionDto dto)
    {
        var created = await _transactionService.AddAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TransactionDto>> Update(Guid id, CreateTransactionDto dto)
    {
        var updated = await _transactionService.UpdateAsync(id, dto);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPut("{id:guid}/series")]
    public async Task<ActionResult<TransactionDto>> UpdateSeries(Guid id, CreateTransactionDto dto)
    {
        var updated = await _transactionService.UpdateSeriesAsync(id, dto);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var deleted = await _transactionService.DeleteAsync(id);
        return deleted ? NoContent() : NotFound();
    }

    [HttpDelete("{id:guid}/series")]
    public async Task<IActionResult> DeleteSeries(Guid id)
    {
        var deleted = await _transactionService.DeleteSeriesAsync(id);
        return deleted ? NoContent() : NotFound();
    }

    [HttpGet("earliest")]
    public async Task<ActionResult<DateTime?>> GetEarliestDate()
    {
        var earliest = await _transactionService.GetEarliestDateAsync();
        return Ok(earliest);
    }

    [HttpPatch("credit-cards/{creditCardId:guid}/invoices/{year:int}/{month:int}/status")]
    public async Task<IActionResult> SetInvoiceStatus(Guid creditCardId, int year, int month, SetInvoiceStatusDto dto)
    {
        var updated = await _transactionService.SetInvoiceStatusAsync(creditCardId, year, month, dto.Status);
        return updated == 0 ? NotFound() : NoContent();
    }
}
