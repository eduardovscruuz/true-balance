import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, switchMap } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

import { CreditCardService } from '../../../core/services/credit-card.service';
import { PayInvoiceModalService } from '../../../core/services/pay-invoice-modal.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';

// Extraído de CreditCardInvoice pra virar um modal global (ver PayInvoiceModalService) —
// assim tanto a tela de Fatura do Cartão quanto Transações do Mês conseguem abrir o mesmo
// fluxo de "pagar fatura" sem duplicar a lógica de crédito por pagamento adiantado.
@Component({
  selector: 'app-pay-invoice-modal',
  imports: [LucideAngularModule, FormsModule, CurrencyMaskDirective, CurrencyPipe],
  templateUrl: './pay-invoice-modal.html',
})
export class PayInvoiceModal {
  private readonly transactionService = inject(TransactionService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly modalService = inject(PayInvoiceModalService);

  readonly request = this.modalService.request;
  readonly isNewPayment = computed(() => this.request()?.mode === 'pay');

  private readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });

  readonly creditCard = computed(() => {
    const req = this.request();
    return req ? this.creditCards().find((c) => c.id === req.creditCardId) : undefined;
  });

  // Busca só as transações do mês da fatura sendo paga (não do mês navegado no topo do
  // app, que pode ser outro — ver botão "Pagar" das linhas de fatura em TransactionTable).
  private readonly invoiceTransactions = toSignal(
    toObservable(this.request).pipe(
      switchMap((req) => (req ? this.transactionService.getByMonth(req.year, req.month) : of(undefined))),
    ),
  );

  readonly invoiceItems = computed(() => {
    const req = this.request();
    const all = this.invoiceTransactions();

    if (!req || all === undefined) {
      return undefined;
    }

    return all.filter((t) => t.creditCardId === req.creditCardId);
  });

  readonly invoiceTotal = computed(() =>
    (this.invoiceItems() ?? []).reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0),
  );

  readonly invoicePaidDate = computed(() => this.invoiceItems()?.find((t) => t.paidDate)?.paidDate ?? null);

  // Categorias fixas pro pagamento a mais — o usuário pediu pra travar nessas duas (sem
  // seletor nenhum, ver template) em vez de escolher toda vez: "Adiantamento" (Despesa,
  // usada na fatura ATUAL) e "Devoluções, Estornos & Créditos" (Receita, usada na fatura
  // SEGUINTE). Cada lado usa uma categoria do tipo certo — misturar Expense/Income sob a
  // mesma categoria quebraria o resumo por categoria do Dashboard (ver monthSummary, que
  // assume tipo único por categoria).
  private static readonly OVERPAYMENT_EXPENSE_CATEGORY_ID = 'cedad7ba-0fc7-4dc1-97d1-ba540dca4469';
  private static readonly OVERPAYMENT_CREDIT_CATEGORY_ID = 'dd7b117b-4f1a-44a0-a478-47ae78b0dd4f';

  // Overrides do que o usuário digitou nesta sessão do modal — null enquanto intocado,
  // caso em que os computed abaixo caem pro valor padrão (hoje / total da fatura / data
  // já paga). app.html só monta este componente enquanto request() não for null (ver
  // @if), então normalmente cada "abrir" já é uma instância nova; o effect abaixo é só
  // uma segunda trava pro caso (hoje não alcançável pela UI, mas barato de garantir) de
  // o cardId/mês do request mudar com a MESMA instância viva.
  private readonly paidDateOverride = signal<string | null>(null);
  private readonly paidAmountOverride = signal<number | null>(null);

  constructor() {
    effect(() => {
      const req = this.request();

      if (req) {
        untracked(() => {
          this.paidDateOverride.set(null);
          this.paidAmountOverride.set(null);
        });
      }
    });
  }

  readonly paidDateInput = computed(() => {
    const override = this.paidDateOverride();

    if (override !== null) {
      return override;
    }

    if (!this.isNewPayment()) {
      const paidDate = this.invoicePaidDate();
      if (paidDate) {
        return this.isoToInputValue(paidDate);
      }
    }

    return this.todayAsInputValue();
  });

  readonly paidAmountInput = computed(() => this.paidAmountOverride() ?? this.invoiceTotal());

  readonly overpaymentAmount = computed(() => {
    if (!this.isNewPayment()) {
      return 0;
    }

    const diff = this.paidAmountInput() - this.invoiceTotal();
    return diff > 0 ? diff : 0;
  });

  private nextYearMonth(): { year: number; month: number } {
    const req = this.request()!;
    const index = req.year * 12 + (req.month - 1) + 1;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  }

  readonly nextInvoiceMonthLabel = computed(() => {
    if (!this.request()) {
      return '';
    }

    const { year, month } = this.nextYearMonth();
    const rawLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${rawLabel.charAt(0).toUpperCase()}${rawLabel.slice(1)}/${year}`;
  });

  readonly currentInvoiceMonthLabel = computed(() => {
    const req = this.request();

    if (!req) {
      return '';
    }

    const rawLabel = new Date(req.year, req.month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${rawLabel.charAt(0).toUpperCase()}${rawLabel.slice(1)}/${req.year}`;
  });

  private currentInvoiceDueDate(): Date | null {
    const req = this.request();
    const card = this.creditCard();

    if (!req || !card) {
      return null;
    }

    const daysInMonth = new Date(req.year, req.month, 0).getDate();
    return new Date(Date.UTC(req.year, req.month - 1, Math.min(card.dueDay, daysInMonth)));
  }

  private nextInvoiceDueDate(): Date | null {
    const card = this.creditCard();

    if (!this.request() || !card) {
      return null;
    }

    const { year, month } = this.nextYearMonth();
    const daysInMonth = new Date(year, month, 0).getDate();
    return new Date(Date.UTC(year, month - 1, Math.min(card.dueDay, daysInMonth)));
  }

  setPaidDateInput(value: string): void {
    this.paidDateOverride.set(value);
  }

  setPaidAmountInput(value: number | null): void {
    this.paidAmountOverride.set(value);
  }

  close(): void {
    this.modalService.close();
  }

  confirm(): void {
    const req = this.request();

    if (!req) {
      return;
    }

    const overpayment = this.overpaymentAmount();
    const currentDueDate = this.currentInvoiceDueDate();
    const nextDueDate = this.nextInvoiceDueDate();
    const paidDateIso = `${this.paidDateInput()}T00:00:00Z`;

    this.transactionService
      .setInvoiceStatus(req.creditCardId, req.year, req.month, 'Paid', paidDateIso)
      .subscribe(() => {
        if (overpayment > 0 && currentDueDate && nextDueDate) {
          const extraExpense = this.transactionService.create({
            accountId: null,
            creditCardId: req.creditCardId,
            categoryId: PayInvoiceModal.OVERPAYMENT_EXPENSE_CATEGORY_ID,
            subcategoryId: null,
            type: 'Expense',
            status: 'Paid',
            amount: overpayment,
            description: `Pagamento adiantado — vira crédito na fatura de ${this.nextInvoiceMonthLabel()}`,
            date: currentDueDate.toISOString(),
            isFixed: false,
            installmentInfo: null,
            recurrenceGroupId: null,
            recurrenceDay: null,
            recurrenceEndDate: null,
            installmentNumber: null,
            totalInstallments: null,
            paidDate: paidDateIso,
            purchaseDate: null,
          });

          const nextCredit = this.transactionService.create({
            accountId: null,
            creditCardId: req.creditCardId,
            categoryId: PayInvoiceModal.OVERPAYMENT_CREDIT_CATEGORY_ID,
            subcategoryId: null,
            type: 'Income',
            status: 'Pending',
            amount: overpayment,
            description: 'Crédito por pagamento adiantado',
            date: nextDueDate.toISOString(),
            isFixed: false,
            installmentInfo: null,
            recurrenceGroupId: null,
            recurrenceDay: null,
            recurrenceEndDate: null,
            installmentNumber: null,
            totalInstallments: null,
            paidDate: null,
            purchaseDate: null,
          });

          forkJoin([extraExpense, nextCredit]).subscribe(() => {
            this.transactionService.notifyChanged();
            this.modalService.close();
          });
          return;
        }

        this.transactionService.notifyChanged();
        this.modalService.close();
      });
  }

  private todayAsInputValue(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isoToInputValue(iso: string): string {
    const date = new Date(iso);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
