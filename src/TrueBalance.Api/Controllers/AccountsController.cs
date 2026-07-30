using Microsoft.AspNetCore.Mvc;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;

namespace TrueBalance.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AccountsController : ControllerBase
{
    private readonly IAccountService _accountService;

    public AccountsController(IAccountService accountService)
    {
        _accountService = accountService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AccountDto>>> GetAll()
    {
        var accounts = await _accountService.GetAllAsync();
        return Ok(accounts);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AccountDto>> GetById(Guid id)
    {
        var account = await _accountService.GetByIdAsync(id);
        return account is null ? NotFound() : Ok(account);
    }

    [HttpPost]
    public async Task<ActionResult<AccountDto>> Create(CreateAccountDto dto)
    {
        var created = await _accountService.AddAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }
}
