using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

// Igual a CreateTransactionDto (mesmos campos, mesma ordem) mais dois campos exclusivos
// da IA: quando o texto do usuário parece confirmar uma transação PENDENTE que já existe
// (ex: "recebi os mil reais do Laboclin" batendo com uma pendência já cadastrada), esses
// dois campos apontam pra ela — o front-end decide se atualiza a pendência (marcando como
// paga) ou cria uma transação nova, nunca o backend sozinho.
public record AiParsedTransactionDto(
    Guid? AccountId,
    Guid? CreditCardId,
    Guid CategoryId,
    Guid? SubcategoryId,
    TransactionType Type,
    TransactionStatus Status,
    decimal Amount,
    string Description,
    DateTime Date,
    bool IsFixed,
    string? InstallmentInfo,
    Guid? RecurrenceGroupId,
    int? RecurrenceDay,
    DateTime? RecurrenceEndDate,
    int? InstallmentNumber,
    int? TotalInstallments,
    DateTime? PaidDate,
    DateTime? PurchaseDate,
    Guid? MatchedPendingTransactionId,
    string? MatchedPendingLabel);
