import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, switchMap } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { CategoryService } from '../../../core/services/category.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { MonthSelectionService } from '../../../core/services/month-selection.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';
import { STATUS_BADGE_BASE_CLASS, STATUS_BADGE_CLASS } from '../../../shared/utils/payment-status.util';

@Component({
  selector: 'app-credit-card-invoice',
  imports: [RouterLink, CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './credit-card-invoice.html',
  styleUrl: './credit-card-invoice.scss',
})
export class CreditCardInvoice {
  private readonly transactionService = inject(TransactionService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  // Mês selecionado é global (seletor único na barra de navegação) — a fatura mostrada
  // é sempre a do mês/ano navegado ali, igual ao resto do app.
  private readonly monthSelection = inject(MonthSelectionService);

  // Lida direto do Observable de paramMap (não do snapshot, só lido uma vez) — o
  // dropdown de cartão navega pra essa MESMA rota com um :id diferente, e o Angular
  // reaproveita a instância do componente nesse caso (não recria, não refaz ngOnInit),
  // então só o Observable reage à troca de :id na URL.
  private readonly creditCardId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: null,
  });

  readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });
  private readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });
  private readonly subcategories = toSignal(this.subcategoryService.getAll(), { initialValue: [] });

  readonly resolveIconName = resolveLucideIconName;
  readonly statusBadgeBaseClass = STATUS_BADGE_BASE_CLASS;
  readonly statusBadgeClass = STATUS_BADGE_CLASS;

  readonly creditCard = computed(() => this.creditCards().find((c) => c.id === this.creditCardId()));

  // "agosto de 2026" -> "Agosto de 2026" — aparece como início do título do card, não
  // no meio de uma frase.
  readonly selectedMonthLabel = computed(() => {
    const label = this.monthSelection.selectedMonthLabel();
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

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
    const subcategoryById = new Map(this.subcategories().map((subcategory) => [subcategory.id, subcategory]));

    return [...all]
      .filter((t) => t.creditCardId === cardId)
      // Ordena pela data REAL da compra, não pelo vencimento (que é igual pra todo mundo
      // dentro da mesma fatura, então não distingue a ordem de nada).
      .sort((a, b) => (a.purchaseDate ?? a.date).localeCompare(b.purchaseDate ?? b.date))
      .map((transaction) => {
        const category = categoryById.get(transaction.categoryId);
        const subcategory = transaction.subcategoryId ? subcategoryById.get(transaction.subcategoryId) : undefined;
        return {
          ...transaction,
          // Mesmo padrão de Transações do Mês: subcategoria (quando tem) é mais específica
          // que a categoria, então prevalece na exibição — o ícone/cor continuam os da
          // categoria (subcategoria não tem os próprios).
          categoryName: subcategory?.name ?? category?.name ?? '—',
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

  // Data real do pagamento — diferente do vencimento (Date), útil quando a fatura é paga
  // adiantado ou atrasado. Nula enquanto Pendente (ver SetInvoiceStatusAsync).
  readonly invoicePaidDate = computed(() => this.invoiceItems()?.find((t) => t.paidDate)?.paidDate ?? null);

  selectCreditCard(id: string): void {
    this.router.navigate(['/credit-cards', id, 'invoice']);
  }

  // Um único fluxo de "escolher data" serve tanto pra pagar (Pendente -> Pago) quanto
  // pra corrigir a data de um pagamento já registrado — as duas ações são idênticas no
  // fim (SetInvoiceStatusAsync com Status=Paid + a data escolhida), só o valor inicial
  // sugerido no campo muda (hoje, ao pagar; a data já salva, ao editar).
  readonly isPickingPaidDate = signal(false);
  readonly paidDateInput = signal(this.todayAsInputValue());

  startPaying(): void {
    this.paidDateInput.set(this.todayAsInputValue());
    this.isPickingPaidDate.set(true);
  }

  startEditingPaidDate(): void {
    const current = this.invoicePaidDate();
    this.paidDateInput.set(current ? this.isoToInputValue(current) : this.todayAsInputValue());
    this.isPickingPaidDate.set(true);
  }

  cancelPaidDatePicker(): void {
    this.isPickingPaidDate.set(false);
  }

  setPaidDateInput(value: string): void {
    this.paidDateInput.set(value);
  }

  confirmPaidDate(): void {
    const cardId = this.creditCardId();

    if (cardId === null) {
      return;
    }

    const { year, month } = this.yearMonth();

    this.transactionService.setInvoiceStatus(cardId, year, month, 'Paid', `${this.paidDateInput()}T00:00:00Z`).subscribe(() => {
      this.isPickingPaidDate.set(false);
      this.refreshTrigger.update((n) => n + 1);
    });
  }

  // Reverter não pede confirmação/data — é só desfazer um "marcar como pago" feito sem
  // querer, então volta direto pra Pendente (PaidDate é zerado, ver SetInvoiceStatusAsync).
  markAsPending(): void {
    const cardId = this.creditCardId();

    if (cardId === null) {
      return;
    }

    const { year, month } = this.yearMonth();

    this.transactionService
      .setInvoiceStatus(cardId, year, month, 'Pending')
      .subscribe(() => this.refreshTrigger.update((n) => n + 1));
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

  // Mesma lógica de transaction-list.ts: item avulso pede confirmação simples; item que
  // faz parte de uma série (fixa ou parcelada, ex: "Fatura parcelada" 1/5) oferece excluir
  // só esta ocorrência ou esta e todas as próximas PENDENTES da série.
  deleteItem(id: string, description: string, recurrenceGroupId: string | null): void {
    if (recurrenceGroupId === null) {
      if (!confirm(`Excluir "${description}"? Essa ação não pode ser desfeita.`)) {
        return;
      }

      this.transactionService.delete(id).subscribe(() => this.refreshTrigger.update((n) => n + 1));
      return;
    }

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
