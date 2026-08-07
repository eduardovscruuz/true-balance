import { Injectable, signal } from '@angular/core';

export interface PayInvoiceRequest {
  creditCardId: string;
  year: number;
  month: number;
  // 'pay': Pendente -> Pago, mostra campo de Valor pago/crédito adiantado.
  // 'editDate': corrige a data de um pagamento já feito, sem repetir o crédito.
  mode: 'pay' | 'editDate';
}

// Serviço global (mesmo padrão de TransactionModalService/AiModalService) pra permitir
// pagar uma fatura de qualquer tela (Fatura do Cartão, Transações do Mês) sem duplicar o
// modal em cada lugar — ver PayInvoiceModal, renderizado uma vez em app.html.
@Injectable({ providedIn: 'root' })
export class PayInvoiceModalService {
  readonly request = signal<PayInvoiceRequest | null>(null);

  open(request: PayInvoiceRequest): void {
    this.request.set(request);
  }

  close(): void {
    this.request.set(null);
  }
}
