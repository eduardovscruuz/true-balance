using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface ITransactionService
{
    Task<IEnumerable<TransactionDto>> GetAllAsync();
    Task<TransactionDto?> GetByIdAsync(Guid id);
    Task<TransactionDto> AddAsync(CreateTransactionDto dto);
}
