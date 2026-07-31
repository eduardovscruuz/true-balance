export interface CreditCard {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  limit: number;
  paymentAccountId: string | null;
}

export interface CreateCreditCard {
  name: string;
  closingDay: number;
  dueDay: number;
  limit: number;
  paymentAccountId: string | null;
}
