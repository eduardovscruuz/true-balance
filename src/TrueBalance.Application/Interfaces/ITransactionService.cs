using TrueBalance.Application.DTOs;
using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.Interfaces;

public interface ITransactionService
{
    Task<IEnumerable<TransactionDto>> GetAllAsync();
    Task<TransactionDto?> GetByIdAsync(Guid id);
    Task<TransactionDto> AddAsync(CreateTransactionDto dto);
    Task<IEnumerable<TransactionDto>> GetByMonthAsync(int year, int month);
    Task<TransactionDto?> UpdateAsync(Guid id, CreateTransactionDto dto);
    Task<TransactionDto?> UpdateSeriesAsync(Guid id, CreateTransactionDto dto);
    Task<bool> DeleteAsync(Guid id);
    Task<bool> DeleteSeriesAsync(Guid id);
    Task<DateTime?> GetEarliestDateAsync();
    Task<int> SetInvoiceStatusAsync(Guid creditCardId, int year, int month, TransactionStatus status, DateTime? paidDate);
}
