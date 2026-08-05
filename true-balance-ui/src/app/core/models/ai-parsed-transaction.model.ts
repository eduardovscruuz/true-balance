import { CreateTransaction } from './transaction.model';

// O que POST /api/ai/parse devolve: um CreateTransaction normal (pra criar do zero) mais
// dois campos exclusivos da IA — quando o texto parece confirmar uma transação PENDENTE
// que já existe (ex: "recebi os mil reais do Laboclin"), esses campos apontam pra ela.
// O front-end decide se atualiza essa pendência (marcando como paga) ou cria uma nova —
// a IA só sugere, nunca decide sozinha.
export interface AiParsedTransaction extends CreateTransaction {
  matchedPendingTransactionId: string | null;
  matchedPendingLabel: string | null;
}
