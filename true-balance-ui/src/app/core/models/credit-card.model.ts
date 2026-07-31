export interface CreditCard {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  limit: number;
  paymentAccountId: string | null;
  // Igual Category (color/icon) — usado pra representar o cartão com um selo colorido
  // na coluna Categoria de "Transações do Mês", já que a fatura ali é agrupada (não tem
  // categoria própria). Nulos pra cartões cadastrados antes desse campo existir.
  color: string | null;
  icon: string | null;
}

export interface CreateCreditCard {
  name: string;
  closingDay: number;
  dueDay: number;
  limit: number;
  paymentAccountId: string | null;
  color: string | null;
  icon: string | null;
}
