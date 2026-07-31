export type AccountType = 'Checking' | 'MealVoucher' | 'Savings';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  balance: number;
  currentBalance: number;
  createdAt: string;
}

export interface CreateAccount {
  name: string;
  type: AccountType;
  color: string;
  balance: number;
}

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'Checking', label: 'Conta Corrente' },
  { value: 'MealVoucher', label: 'Vale Refeição' },
  { value: 'Savings', label: 'Poupança' },
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = Object.fromEntries(
  ACCOUNT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AccountType, string>;
