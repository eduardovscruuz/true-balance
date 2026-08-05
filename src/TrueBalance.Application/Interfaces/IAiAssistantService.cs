using TrueBalance.Application.DTOs;

namespace TrueBalance.Application.Interfaces;

public interface IAiAssistantService
{
    Task<IEnumerable<AiParsedTransactionDto>> ParseTransactionsFromTextAsync(string userInput);
}
