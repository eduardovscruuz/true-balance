using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Domain.Enums;
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
        var accounts = await _context.Accounts.ToListAsync();
        var deltas = await GetPaidDeltasByAccountAsync();

        return accounts.Select(a => MapToDto(a, deltas.GetValueOrDefault(a.Id, 0m)));
    }

    public async Task<AccountDto?> GetByIdAsync(Guid id)
    {
        var account = await _context.Accounts.FindAsync(id);

        if (account is null)
        {
            return null;
        }

        var delta = await GetPaidDeltaAsync(id);
        return MapToDto(account, delta);
    }

    public async Task<AccountDto> AddAsync(CreateAccountDto dto)
    {
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Name = dto.Name,
            Type = dto.Type,
            Color = dto.Color,
            Balance = dto.Balance,
            CreatedAt = DateTime.UtcNow
        };

        _context.Accounts.Add(account);
        await _context.SaveChangesAsync();

        // Conta recém-criada não tem transações ainda, então saldo atual == saldo inicial.
        return MapToDto(account, delta: 0m);
    }

    public async Task<AccountDto?> UpdateAsync(Guid id, CreateAccountDto dto)
    {
        var account = await _context.Accounts.FindAsync(id);

        if (account is null)
        {
            return null;
        }

        account.Name = dto.Name;
        account.Type = dto.Type;
        account.Color = dto.Color;
        account.Balance = dto.Balance;

        await _context.SaveChangesAsync();

        var delta = await GetPaidDeltaAsync(id);
        return MapToDto(account, delta);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var account = await _context.Accounts.FindAsync(id);

        if (account is null)
        {
            return false;
        }

        _context.Accounts.Remove(account);
        await _context.SaveChangesAsync();

        return true;
    }

    // Saldo atual = saldo inicial + soma das transações PAGAS da conta (receita soma, despesa
    // e transferência subtraem — mesma convenção já usada pelo SnapshotService na Fase 6).
    private async Task<decimal> GetPaidDeltaAsync(Guid accountId)
    {
        return await _context.Transactions
            .Where(t => t.AccountId == accountId && t.Status == TransactionStatus.Paid)
            .SumAsync(t => (decimal?)(t.Type == TransactionType.Income ? t.Amount : -t.Amount)) ?? 0m;
    }

    private async Task<Dictionary<Guid, decimal>> GetPaidDeltasByAccountAsync()
    {
        return await _context.Transactions
            .Where(t => t.AccountId != null && t.Status == TransactionStatus.Paid)
            .GroupBy(t => t.AccountId!.Value)
            .Select(g => new
            {
                AccountId = g.Key,
                Delta = g.Sum(t => t.Type == TransactionType.Income ? t.Amount : -t.Amount)
            })
            .ToDictionaryAsync(x => x.AccountId, x => x.Delta);
    }

    private static AccountDto MapToDto(Account account, decimal delta) => new(
        account.Id,
        account.Name,
        account.Type,
        account.Color,
        account.Balance,
        account.Balance + delta,
        account.CreatedAt);
}
