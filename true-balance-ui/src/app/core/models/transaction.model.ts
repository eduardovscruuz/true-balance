export type TransactionType = 'Income' | 'Expense' | 'Transfer';
export type TransactionStatus = 'Pending' | 'Paid';

export interface Transaction {
  id: string;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string;
  subcategoryId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  description: string;
  date: string;
  isFixed: boolean;
  installmentInfo: string | null;
  recurrenceGroupId: string | null;
  recurrenceDay: number | null;
  recurrenceEndDate: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  // Quando foi realmente pago — diferente de Date, que pra fatura de cartão é o
  // vencimento, não o dia real do pagamento. Preenchida só pelo botão "marcar fatura
  // como Paga" (ver CreditCardInvoice), nunca editável direto numa transação — pagar é
  // um fato da fatura inteira, não de uma compra isolada.
  paidDate: string | null;
  // Dia real da compra — diferente de Date, que pra cartão é o vencimento da fatura.
  // Só existe pra compras de cartão; nula pra transações comuns (cujo Date já é o dia
  // real) e pra itens de cartão criados antes desse campo existir.
  purchaseDate: string | null;
}

export interface CreateTransaction {
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string;
  subcategoryId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  description: string;
  date: string;
  isFixed: boolean;
  installmentInfo: string | null;
  recurrenceGroupId: string | null;
  recurrenceDay: number | null;
  recurrenceEndDate: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  paidDate: string | null;
  purchaseDate: string | null;
}
