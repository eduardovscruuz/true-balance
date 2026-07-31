import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { CategoryService } from '../../../core/services/category.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { MonthSelectionService } from '../../../core/services/month-selection.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';

@Component({
  selector: 'app-transaction-list',
  imports: [RouterLink, CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './transaction-list.html',
  styleUrl: './transaction-list.scss',
})
export class TransactionList {
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly creditCardService = inject(CreditCardService);
  // Mês selecionado é global (seletor único na barra de navegação, ver app.html) —
  // esta tela só lê os signals, nunca tem o próprio estado de mês.
  private readonly monthSelection = inject(MonthSelectionService);

  private readonly refreshTrigger = signal(0);

  private readonly yearMonth = computed(() => ({
    year: this.monthSelection.selectedYear(),
    month: this.monthSelection.selectedMonth(),
  }));

  private readonly yearMonth$ = toObservable(this.yearMonth);

  private readonly transactions = toSignal(
    combineLatest([this.yearMonth$, toObservable(this.refreshTrigger)]).pipe(
      switchMap(([{ year, month }]) => this.transactionService.getByMonth(year, month)),
    ),
  );

  private readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });
  private readonly subcategories = toSignal(this.subcategoryService.getAll(), { initialValue: [] });
  private readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });

  readonly resolveIconName = resolveLucideIconName;

  readonly sortField = signal<'date' | 'amount'>('date');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  toggleSort(field: 'date' | 'amount'): void {
    if (this.sortField() === field) {
      this.sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDirection.set('desc');
    }
  }

  // Compras de cartão não aparecem uma por uma aqui — são agrupadas numa linha só por
  // cartão (a fatura inteira daquele mês), com o total e o status da fatura (que é único:
  // paga ou não, nunca "meio paga" — ver CreditCardInvoice/setInvoiceStatus). Pra ver os
  // itens da fatura, a linha agrupada leva pra tela dedicada de cartões.
  readonly rows = computed(() => {
    const transactions = this.transactions();

    if (transactions === undefined) {
      return undefined;
    }

    const categoryById = new Map(this.categories().map((category) => [category.id, category]));
    const subcategoryById = new Map(this.subcategories().map((subcategory) => [subcategory.id, subcategory]));
    const creditCardById = new Map(this.creditCards().map((creditCard) => [creditCard.id, creditCard]));

    const accountTransactions = transactions.filter((t) => t.creditCardId === null);
    const cardTransactions = transactions.filter((t) => t.creditCardId !== null);

    const transactionRows = accountTransactions.map((transaction) => {
      const category = categoryById.get(transaction.categoryId);
      const subcategory = transaction.subcategoryId ? subcategoryById.get(transaction.subcategoryId) : undefined;
      return {
        kind: 'transaction' as const,
        ...transaction,
        categoryName: subcategory?.name ?? category?.name ?? '—',
        categoryColor: category?.color ?? null,
        categoryIcon: category?.icon ?? null,
      };
    });

    const cardGroups = new Map<string, typeof cardTransactions>();
    for (const transaction of cardTransactions) {
      const list = cardGroups.get(transaction.creditCardId!) ?? [];
      list.push(transaction);
      cardGroups.set(transaction.creditCardId!, list);
    }

    const cardRows = [...cardGroups.entries()].map(([creditCardId, items]) => ({
      kind: 'cardInvoice' as const,
      creditCardId,
      cardName: creditCardById.get(creditCardId)?.name ?? '—',
      date: items.reduce((latest, t) => (t.date > latest ? t.date : latest), items[0].date),
      // Estorno (registrado como Receita no cartão) reduz o total da fatura, não soma
      // junto com as compras.
      amount: items.reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0),
      status: items.every((t) => t.status === 'Paid') ? ('Paid' as const) : ('Pending' as const),
      itemCount: items.length,
    }));

    const field = this.sortField();
    const multiplier = this.sortDirection() === 'asc' ? 1 : -1;

    return [...transactionRows, ...cardRows].sort((a, b) =>
      field === 'amount' ? (a.amount - b.amount) * multiplier : a.date.localeCompare(b.date) * multiplier,
    );
  });

  deleteTransaction(id: string, description: string, recurrenceGroupId: string | null): void {
    // Transação avulsa (sem série): confirmação simples de sempre.
    if (recurrenceGroupId === null) {
      if (!confirm(`Excluir a transação "${description}"? Essa ação não pode ser desfeita.`)) {
        return;
      }

      this.transactionService.delete(id).subscribe(() => this.refreshTrigger.update((n) => n + 1));
      return;
    }

    // Faz parte de uma série (fixa ou parcelada): oferece excluir só esta ocorrência ou
    // esta e todas as próximas pendentes da série (as já pagas nunca são afetadas).
    const deleteWholeSeries = confirm(
      `"${description}" faz parte de uma recorrência (fixa ou parcelada).\n\n` +
        `Clique OK para excluir esta e todas as próximas ocorrências PENDENTES da série.\n` +
        `Clique Cancelar para excluir só esta ocorrência.`,
    );

    if (deleteWholeSeries) {
      this.transactionService.deleteSeries(id).subscribe(() => this.refreshTrigger.update((n) => n + 1));
      return;
    }

    if (!confirm(`Excluir apenas esta ocorrência de "${description}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    this.transactionService.delete(id).subscribe(() => this.refreshTrigger.update((n) => n + 1));
  }
}
