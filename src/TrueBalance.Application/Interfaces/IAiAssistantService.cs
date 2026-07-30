using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface IAiAssistantService
{
    Task<IEnumerable<CreateTransactionDto>> ParseTransactionsFromTextAsync(string userInput);
}
