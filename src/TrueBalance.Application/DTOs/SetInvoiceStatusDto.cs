using TrueBalance.Domain.Enums;

namespace TrueBalance.Application.DTOs;

// PaidDate é opcional e só usado quando Status = Paid — sem ele, cai em hoje. Deixa
// explícito pra dar pra registrar um pagamento retroativo (ex: inserindo histórico).
public record SetInvoiceStatusDto(TransactionStatus Status, DateTime? PaidDate);
