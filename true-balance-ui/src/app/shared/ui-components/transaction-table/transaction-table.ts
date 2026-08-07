import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { Transaction } from '../../../core/models/transaction.model';
import { InitialsPipe } from '../../pipes/initials.pipe';
import { resolveLucideIconName } from '../../utils/lucide-icon.util';
import {
  PAYMENT_TIMING_BADGE_CLASS,
  PAYMENT_TIMING_LABEL,
  PaymentTiming,
  STATUS_BADGE_BASE_CLASS,
  STATUS_BADGE_CLASS,
} from '../../utils/payment-status.util';

export interface TransactionTableRow extends Transaction {
  kind: 'transaction';
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  accountName: string;
  accountColor: string | null;
}

export interface CardInvoiceTableRow {
  kind: 'cardInvoice';
  creditCardId: string;
  cardName: string;
  cardColor: string | null;
  cardIcon: string | null;
  invoiceMonthLabel: string;
  // Ano/mês de VENCIMENTO da fatura — não necessariamente o mês em que a linha aparece
  // (uma fatura paga adiantado aparece no mês do pagamento). É o que o botão Pagar
  // precisa pra abrir a fatura certa (ver PayInvoiceModalService).
  dueYear: number;
  dueMonth: number;
  accountName: string;
  accountColor: string | null;
  date: string;
  amount: number;
  status: 'Paid' | 'Pending';
  paymentTiming: PaymentTiming | null;
  itemCount: number;
}

export type TransactionTableRowUnion = TransactionTableRow | CardInvoiceTableRow;

// Adaptado de CardInvoiceTable (mesmo agrupamento por dia, sempre expandido) pra "Transações
// do Mês": ganha colunas a mais (Categoria com nome, Conta, Status) e dois tipos de linha —
// transação avulsa ou fatura de cartão agrupada (ver transaction-list.ts).
@Component({
  selector: 'app-transaction-table',
  imports: [RouterLink, CurrencyPipe, LucideAngularModule, InitialsPipe],
  templateUrl: './transaction-table.html',
})
export class TransactionTable {
  readonly rows = input<TransactionTableRowUnion[] | undefined>(undefined);
  readonly sortDirection = input<'asc' | 'desc'>('desc');

  readonly sortToggled = output<void>();
  readonly editTransaction = output<string>();
  readonly payTransaction = output<string>();
  readonly payInvoice = output<{ creditCardId: string; year: number; month: number }>();

  readonly resolveIconName = resolveLucideIconName;
  readonly statusBadgeBaseClass = STATUS_BADGE_BASE_CLASS;
  readonly statusBadgeClass = STATUS_BADGE_CLASS;
  readonly paymentTimingLabel = PAYMENT_TIMING_LABEL;
  readonly paymentTimingBadgeClass = PAYMENT_TIMING_BADGE_CLASS;

  private static readonly WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  private static readonly MONTH_ABBREVIATIONS = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];

  formatDayHeader(dateIso: string): string {
    const date = new Date(dateIso);
    const weekday = TransactionTable.WEEKDAY_NAMES[date.getUTCDay()];
    const month = TransactionTable.MONTH_ABBREVIATIONS[date.getUTCMonth()];

    return `${weekday}, ${date.getUTCDate()} de ${month}`;
  }

  // Agrupa por dia usando a mesma data já exibida na coluna Data (paidDate/dueDate pra
  // fatura, date pra transação avulsa) — como rows() já vem ordenado pelo pai, itens do
  // mesmo dia ficam consecutivos.
  readonly dayGroups = computed(() => {
    const rows = this.rows();

    if (!rows) {
      return undefined;
    }

    const groups: { dayKey: string; dateIso: string; rows: TransactionTableRowUnion[] }[] = [];

    for (const row of rows) {
      const dayKey = row.date.slice(0, 10);
      const last = groups.length > 0 ? groups[groups.length - 1] : undefined;

      if (last && last.dayKey === row.date.slice(0, 10)) {
        last.rows.push(row);
      } else {
        groups.push({ dayKey, dateIso: row.date, rows: [row] });
      }
    }

    return groups;
  });

  trackRow(row: TransactionTableRowUnion): string {
    return row.kind === 'transaction' ? row.id : `${row.creditCardId}|${row.invoiceMonthLabel}`;
  }

  toggleSort(): void {
    this.sortToggled.emit();
  }

  onEdit(id: string): void {
    this.editTransaction.emit(id);
  }

  onPay(event: Event, id: string): void {
    event.stopPropagation();
    this.payTransaction.emit(id);
  }

  onPayInvoice(event: Event, row: CardInvoiceTableRow): void {
    event.stopPropagation();
    this.payInvoice.emit({ creditCardId: row.creditCardId, year: row.dueYear, month: row.dueMonth });
  }
}
