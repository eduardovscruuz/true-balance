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
        return await _context.CreditCards
            .Select(c => new CreditCardDto(c.Id, c.Name, c.ClosingDay, c.DueDay, c.Limit))
            .ToListAsync();
    }

    public async Task<CreditCardDto?> GetByIdAsync(Guid id)
    {
        var creditCard = await _context.CreditCards.FindAsync(id);

        return creditCard is null
            ? null
            : new CreditCardDto(creditCard.Id, creditCard.Name, creditCard.ClosingDay, creditCard.DueDay, creditCard.Limit);
    }

    public async Task<CreditCardDto> AddAsync(CreateCreditCardDto dto)
    {
        var creditCard = new CreditCard
        {
            Id = Guid.NewGuid(),
            Name = dto.Name,
            ClosingDay = dto.ClosingDay,
            DueDay = dto.DueDay,
            Limit = dto.Limit
        };

        _context.CreditCards.Add(creditCard);
        await _context.SaveChangesAsync();

        return new CreditCardDto(creditCard.Id, creditCard.Name, creditCard.ClosingDay, creditCard.DueDay, creditCard.Limit);
    }
}
