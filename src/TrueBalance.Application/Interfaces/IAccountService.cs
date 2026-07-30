using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface IAccountService
{
    Task<IEnumerable<AccountDto>> GetAllAsync();
    Task<AccountDto?> GetByIdAsync(Guid id);
    Task<AccountDto> AddAsync(CreateAccountDto dto);
}
