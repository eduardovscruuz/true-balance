using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.DTOs;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class CreditCardService : ICreditCardService
{
    private readonly AppDbContext _context;

    public CreditCardService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<CreditCardDto>> GetAllAsync()
    {
        var creditCards = await _context.CreditCards.ToListAsync();
        return creditCards.Select(MapToDto);
    }

    public async Task<CreditCardDto?> GetByIdAsync(Guid id)
    {
        var creditCard = await _context.CreditCards.FindAsync(id);

        return creditCard is null ? null : MapToDto(creditCard);
    }

    public async Task<CreditCardDto> AddAsync(CreateCreditCardDto dto)
    {
        var creditCard = new CreditCard
        {
            Id = Guid.NewGuid(),
            Name = dto.Name,
            ClosingDay = dto.ClosingDay,
            DueDay = dto.DueDay,
            Limit = dto.Limit,
            PaymentAccountId = dto.PaymentAccountId
        };

        _context.CreditCards.Add(creditCard);
        await _context.SaveChangesAsync();

        return MapToDto(creditCard);
    }

    public async Task<CreditCardDto?> UpdateAsync(Guid id, CreateCreditCardDto dto)
    {
        var creditCard = await _context.CreditCards.FindAsync(id);

        if (creditCard is null)
        {
            return null;
        }

        creditCard.Name = dto.Name;
        creditCard.ClosingDay = dto.ClosingDay;
        creditCard.DueDay = dto.DueDay;
        creditCard.Limit = dto.Limit;
        creditCard.PaymentAccountId = dto.PaymentAccountId;

        await _context.SaveChangesAsync();

        return MapToDto(creditCard);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var creditCard = await _context.CreditCards.FindAsync(id);

        if (creditCard is null)
        {
            return false;
        }

        _context.CreditCards.Remove(creditCard);
        await _context.SaveChangesAsync();

        return true;
    }

    private static CreditCardDto MapToDto(CreditCard c) =>
        new(c.Id, c.Name, c.ClosingDay, c.DueDay, c.Limit, c.PaymentAccountId);
}
