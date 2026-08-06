import { Injectable, signal } from '@angular/core';

import { TransactionType } from '../models/transaction.model';

export interface TransactionModalRequest {
  // null na edição (o tipo real vem da transação carregada) e no Cartão (lá o tipo —
  // Compra ou Estorno — é escolhido dentro do próprio formulário, não de fora — ver
  // TransactionForm.isCreditCardMode).
  type: TransactionType | null;
  source?: 'credit-card';
  transactionId?: string;
}

// Estado global de "o modal de lançamento rápido está aberto?" — parecido com
// MonthSelectionService: um signal só de leitura pública + métodos como API de escrita.
// Renderizado em app.html (topo da árvore) pra poder ser aberto de qualquer lugar
// (Dashboard, dropdown "+" do header) sem depender de rota.
@Injectable({ providedIn: 'root' })
export class TransactionModalService {
  private readonly _openRequest = signal<TransactionModalRequest | null>(null);
  readonly openRequest = this._openRequest.asReadonly();

  openExpense(): void {
    this._openRequest.set({ type: 'Expense' });
  }

  openIncome(): void {
    this._openRequest.set({ type: 'Income' });
  }

  openCreditCard(): void {
    this._openRequest.set({ type: null, source: 'credit-card' });
  }

  edit(transactionId: string): void {
    this._openRequest.set({ type: null, transactionId });
  }

  close(): void {
    this._openRequest.set(null);
  }
}
