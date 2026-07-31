import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { CategoryService } from '../../../core/services/category.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { MonthSelectionService } from '../../../core/services/month-selection.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';

@Component({
  selector: 'app-credit-card-invoice',
  imports: [RouterLink, CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './credit-card-invoice.html',
  styleUrl: './credit-card-invoice.scss',
})
export class CreditCardInvoice implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly categoryService = inject(CategoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  // Mês selecionado é global (seletor único na barra de navegação) — a fatura mostrada
  // é sempre a do mês/ano navegado ali, igual ao resto do app.
  private readonly monthSelection = inject(MonthSelectionService);

  private readonly creditCardId = signal<string | null>(null);

  readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });
  private readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });

  readonly resolveIconName = resolveLucideIconName;

  readonly creditCard = computed(() => this.creditCards().find((c) => c.id === this.creditCardId()));

  readonly selectedMonthLabel = computed(() => this.monthSelection.selectedMonthLabel());

  private readonly refreshTrigger = signal(0);

  private readonly yearMonth = computed(() => ({
    year: this.monthSelection.selectedYear(),
    month: this.monthSelection.selectedMonth(),
  }));

  private readonly yearMonth$ = toObservable(this.yearMonth);

  private readonly monthTransactions = toSignal(
    combineLatest([this.yearMonth$, toObservable(this.refreshTrigger)]).pipe(
      switchMap(([{ year, month }]) => this.transactionService.getByMonth(year, month)),
    ),
  );

  readonly invoiceItems = computed(() => {
    const all = this.monthTransactions();
    const cardId = this.creditCardId();

    if (all === undefined || cardId === null) {
      return undefined;
    }

    const categoryById = new Map(this.categories().map((category) => [category.id, category]));

    return [...all]
      .filter((t) => t.creditCardId === cardId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((transaction) => {
        const category = categoryById.get(transaction.categoryId);
        return {
          ...transaction,
          categoryName: category?.name ?? '—',
          categoryColor: category?.color ?? null,
          categoryIcon: category?.icon ?? null,
        };
      });
  });

  // Um estorno é lançado como Receita nesse mesmo cartão (ver botão "Registrar Estorno")
  // — reduz o total da fatura, não soma junto com as compras.
  readonly invoiceTotal = computed(() =>
    (this.invoiceItems() ?? []).reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0),
  );

  // A fatura é um fato único: paga ou não, nunca "meio paga" — na prática, todos os itens
  // devem sempre ter o mesmo status (o botão de alternar atualiza todos juntos). Se por
  // algum motivo estiverem divergentes (dado legado), trata como Pendente por segurança.
  readonly invoiceStatus = computed(() => {
    const items = this.invoiceItems();

    if (!items || items.length === 0) {
      return null;
    }

    return items.every((t) => t.status === 'Paid') ? 'Paid' : 'Pending';
  });

  ngOnInit(): void {
    this.creditCardId.set(this.route.snapshot.paramMap.get('id'));
  }

  selectCreditCard(id: string): void {
    this.router.navigate(['/credit-cards', id, 'invoice']);
  }

  toggleInvoiceStatus(): void {
    const cardId = this.creditCardId();
    const currentStatus = this.invoiceStatus();

    if (cardId === null || currentStatus === null) {
      return;
    }

    const newStatus = currentStatus === 'Paid' ? 'Pending' : 'Paid';
    const { year, month } = this.yearMonth();

    this.transactionService
      .setInvoiceStatus(cardId, year, month, newStatus)
      .subscribe(() => this.refreshTrigger.update((n) => n + 1));
  }
}
