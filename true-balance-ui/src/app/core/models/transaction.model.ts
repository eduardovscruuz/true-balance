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
}
