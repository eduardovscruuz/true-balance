using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class AccountService : IAccountService
{
    private readonly AppDbContext _context;

    public AccountService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<AccountDto>> GetAllAsync()
    {
        return await _context.Accounts
            .Select(a => new AccountDto(a.Id, a.Name, a.Type, a.Balance, a.CreatedAt))
            .ToListAsync();
    }

    public async Task<AccountDto?> GetByIdAsync(Guid id)
    {
        var account = await _context.Accounts.FindAsync(id);

        return account is null
            ? null
            : new AccountDto(account.Id, account.Name, account.Type, account.Balance, account.CreatedAt);
    }

    public async Task<AccountDto> AddAsync(CreateAccountDto dto)
    {
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Name = dto.Name,
            Type = dto.Type,
            Balance = dto.Balance,
            CreatedAt = DateTime.UtcNow
        };

        _context.Accounts.Add(account);
        await _context.SaveChangesAsync();

        return new AccountDto(account.Id, account.Name, account.Type, account.Balance, account.CreatedAt);
    }
}
