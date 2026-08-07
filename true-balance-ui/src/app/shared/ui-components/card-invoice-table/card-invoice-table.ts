import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { Transaction } from '../../../core/models/transaction.model';
import { resolveLucideIconName } from '../../utils/lucide-icon.util';

export interface CardInvoiceItem extends Transaction {
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
}

// Extraído de credit-card-invoice: tabela agrupada por dia (barra separadora com a data
// completa por extenso, ícone da categoria no lugar da coluna Data, sempre expandida —
// sem colapsar/expandir) — vira a base visual reutilizada também por TransactionTable.
@Component({
  selector: 'app-card-invoice-table',
  imports: [CurrencyPipe, LucideAngularModule],
  templateUrl: './card-invoice-table.html',
})
export class CardInvoiceTable {
  readonly items = input<CardInvoiceItem[] | undefined>(undefined);
  readonly sortDirection = input<'asc' | 'desc'>('asc');

  readonly sortToggled = output<void>();
  readonly edit = output<string>();
  readonly deleteItem = output<{ id: string; description: string; recurrenceGroupId: string | null }>();

  readonly resolveIconName = resolveLucideIconName;

  // Mesmo formato do original ("Quinta, 18 de jun") — não dá pra montar isso só com
  // tokens do DatePipe (ver nota original em credit-card-invoice.ts). Lê os componentes
  // em UTC porque a Date guardada é sempre meia-noite UTC.
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
    const weekday = CardInvoiceTable.WEEKDAY_NAMES[date.getUTCDay()];
    const month = CardInvoiceTable.MONTH_ABBREVIATIONS[date.getUTCMonth()];

    return `${weekday}, ${date.getUTCDate()} de ${month}`;
  }

  // Agrupa itens do MESMO dia (data de compra, ou vencimento quando não tem) sob uma barra
  // separadora — como items() já vem ordenado (asc/desc) pelo pai, itens do mesmo dia
  // sempre ficam consecutivos, dá pra agrupar num loop simples sem reordenar.
  readonly dayGroups = computed(() => {
    const items = this.items();

    if (!items) {
      return undefined;
    }

    const groups: { dayKey: string; dateIso: string; items: CardInvoiceItem[] }[] = [];

    for (const item of items) {
      const dateIso = item.purchaseDate ?? item.date;
      const dayKey = dateIso.slice(0, 10);
      const last = groups.length > 0 ? groups[groups.length - 1] : undefined;

      if (last && last.dayKey === dayKey) {
        last.items.push(item);
      } else {
        groups.push({ dayKey, dateIso, items: [item] });
      }
    }

    return groups;
  });

  toggleSort(): void {
    this.sortToggled.emit();
  }

  onEdit(id: string): void {
    this.edit.emit(id);
  }

  onDelete(item: CardInvoiceItem): void {
    this.deleteItem.emit({ id: item.id, description: item.description, recurrenceGroupId: item.recurrenceGroupId });
  }
}
