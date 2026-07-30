using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface ICreditCardService
{
    Task<IEnumerable<CreditCardDto>> GetAllAsync();
    Task<CreditCardDto?> GetByIdAsync(Guid id);
    Task<CreditCardDto> AddAsync(CreateCreditCardDto dto);
}
