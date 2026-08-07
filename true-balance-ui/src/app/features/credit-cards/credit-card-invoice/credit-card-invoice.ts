import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { combineLatest, map, switchMap } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { ConfirmDialog } from '../../../shared/ui-components/confirm-dialog/confirm-dialog';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { CategoryService } from '../../../core/services/category.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { MonthSelectionService } from '../../../core/services/month-selection.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TransactionModalService } from '../../../core/services/transaction-modal.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';
import { STATUS_BADGE_BASE_CLASS, STATUS_BADGE_CLASS } from '../../../shared/utils/payment-status.util';

@Component({
  selector: 'app-credit-card-invoice',
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    LucideAngularModule,
    NgTemplateOutlet,
    ConfirmDialog,
    FormsModule,
    CurrencyMaskDirective,
  ],
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
  protected readonly transactionModal = inject(TransactionModalService);
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

  // refreshTrigger cobre as próprias ações desta tela (pagar, reverter, excluir); o
  // transactionService.refresh global cobre mudanças feitas em outro lugar que não sabe
  // desta tela existe — ex: editar ou excluir um item pelo modal (ver TransactionFormModal),
  // que só notifica pelo canal global, igual o Dashboard já faz.
  private readonly monthTransactions = toSignal(
    combineLatest([this.yearMonth$, toObservable(this.refreshTrigger), toObservable(this.transactionService.refresh)]).pipe(
      switchMap(([{ year, month }]) => this.transactionService.getByMonth(year, month)),
    ),
  );

  // Formato próprio pro separador de dia ("Quinta, 18 de jun") — não dá pra montar isso só
  // com tokens do DatePipe: o CLDR do pt-BR abrevia dia da semana com ponto e "-feira"
  // (ex: "qui.", "quinta-feira") e mês com ponto (ex: "jun."), nenhum bate com o formato
  // pedido. Lê os componentes em UTC (mesma cautela de fuso do resto do formulário) —
  // a Date guardada é sempre meia-noite UTC, ler em hora local podia cair no dia anterior.
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
    const weekday = CreditCardInvoice.WEEKDAY_NAMES[date.getUTCDay()];
    const month = CreditCardInvoice.MONTH_ABBREVIATIONS[date.getUTCMonth()];

    return `${weekday}, ${date.getUTCDate()} de ${month}`;
  }

  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  toggleSort(): void {
    this.sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
  }

  readonly invoiceItems = computed(() => {
    const all = this.monthTransactions();
    const cardId = this.creditCardId();

    if (all === undefined || cardId === null) {
      return undefined;
    }

    const categoryById = new Map(this.categories().map((category) => [category.id, category]));
    const subcategoryById = new Map(this.subcategories().map((subcategory) => [subcategory.id, subcategory]));
    const direction = this.sortDirection() === 'asc' ? 1 : -1;

    return [...all]
      .filter((t) => t.creditCardId === cardId)
      // Ordena pela data REAL da compra, não pelo vencimento (que é igual pra todo mundo
      // dentro da mesma fatura, então não distingue a ordem de nada).
      .sort((a, b) => direction * (a.purchaseDate ?? a.date).localeCompare(b.purchaseDate ?? b.date))
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
  // — reduz o total da fatura, não soma junto com as compras. Esse é o valor FINAL
  // previsto pra fatura, já contando fixas que ainda nem chegaram (ver confirmedTotal).
  readonly invoiceTotal = computed(() =>
    (this.invoiceItems() ?? []).reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0),
  );

  // Quanto da fatura já é "real" HOJE — igual o app do banco mostra. Compra avulsa ou
  // parcelada conta inteira desde já (a dívida foi assumida no ato da compra). FIXA é
  // diferente: só conta se o dia dela (o dia real em que aquela cobrança específica cai,
  // não o mês da fatura) já chegou — uma assinatura que só vai cobrar daqui a duas
  // semanas ainda não é um gasto de verdade, é só a projeção de que vai repetir.
  readonly confirmedTotal = computed(() => {
    const items = this.invoiceItems() ?? [];
    const now = new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    return items.reduce((sum, t) => {
      if (t.isFixed && new Date(t.purchaseDate ?? t.date) > todayUtcMidnight) {
        return sum;
      }

      return sum + (t.type === 'Income' ? -t.amount : t.amount);
    }, 0);
  });

  // Agrupa itens do MESMO dia (data de compra, ou vencimento quando não tem) sob uma
  // barra separadora com a data completa — todo dia entra num grupo (mesmo com uma
  // compra só), pra deixar claro visualmente que a lista é organizada por dia (ver
  // template); como a data completa já aparece ali, as linhas de compra abaixo não
  // repetem "dd/MM" (esse espaço vira o ícone da categoria). Como invoiceItems() já vem
  // ordenado (asc/desc), itens do mesmo dia sempre ficam consecutivos — dá pra agrupar
  // num loop simples, sem precisar reordenar depois.
  readonly invoiceDayGroups = computed(() => {
    const items = this.invoiceItems();

    if (!items) {
      return undefined;
    }

    const groups: { dayKey: string; dateIso: string; items: typeof items }[] = [];

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
  // sugerido no campo muda (hoje, ao pagar; a data já salva, ao editar). isNewPayment
  // distingue os dois só pra decidir se mostra o campo de Valor pago/crédito adiantado
  // abaixo — editar a data de um pagamento já feito não deveria gerar um crédito de novo
  // toda vez.
  readonly isPickingPaidDate = signal(false);
  readonly isNewPayment = signal(true);
  readonly paidDateInput = signal(this.todayAsInputValue());

  // "Vou pagar a mais pra já liberar limite" — se o valor pago passar do total da fatura,
  // a diferença vira um crédito (estorno) lançado direto na fatura do mês SEGUINTE deste
  // mesmo cartão, com status Pendente (reduz o total daquela fatura quando ela chegar,
  // igual qualquer outro estorno). Categoria é obrigatória porque o modelo de Transaction
  // exige uma (nunca fica sem — ver CreateTransaction), então pedimos aqui mesmo.
  readonly paidAmountInput = signal<number | null>(null);
  readonly overpaymentCategoryId = signal<string>('');

  readonly incomeCategories = computed(() => this.categories().filter((c) => c.type === 'Income'));

  readonly overpaymentAmount = computed(() => {
    const paid = this.paidAmountInput();

    if (paid === null) {
      return 0;
    }

    const diff = paid - this.invoiceTotal();
    return diff > 0 ? diff : 0;
  });

  private nextYearMonth(): { year: number; month: number } {
    const { year, month } = this.yearMonth();
    const index = year * 12 + (month - 1) + 1;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  }

  readonly nextInvoiceMonthLabel = computed(() => {
    const { year, month } = this.nextYearMonth();
    const rawLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${rawLabel.charAt(0).toUpperCase()}${rawLabel.slice(1)}/${year}`;
  });

  private nextInvoiceDueDate(): Date | null {
    const card = this.creditCard();

    if (!card) {
      return null;
    }

    const { year, month } = this.nextYearMonth();
    const daysInMonth = new Date(year, month, 0).getDate();
    return new Date(Date.UTC(year, month - 1, Math.min(card.dueDay, daysInMonth)));
  }

  startPaying(): void {
    this.paidDateInput.set(this.todayAsInputValue());
    this.paidAmountInput.set(this.invoiceTotal());
    this.overpaymentCategoryId.set('');
    this.isNewPayment.set(true);
    this.isPickingPaidDate.set(true);
  }

  startEditingPaidDate(): void {
    const current = this.invoicePaidDate();
    this.paidDateInput.set(current ? this.isoToInputValue(current) : this.todayAsInputValue());
    this.isNewPayment.set(false);
    this.isPickingPaidDate.set(true);
  }

  cancelPaidDatePicker(): void {
    this.isPickingPaidDate.set(false);
  }

  setPaidDateInput(value: string): void {
    this.paidDateInput.set(value);
  }

  setPaidAmountInput(value: number | null): void {
    this.paidAmountInput.set(value);
  }

  setOverpaymentCategoryId(value: string): void {
    this.overpaymentCategoryId.set(value);
  }

  confirmPaidDate(): void {
    const cardId = this.creditCardId();

    if (cardId === null) {
      return;
    }

    const { year, month } = this.yearMonth();
    const overpayment = this.isNewPayment() ? this.overpaymentAmount() : 0;
    const overpaymentCategoryId = this.overpaymentCategoryId();
    const nextDueDate = this.nextInvoiceDueDate();

    this.transactionService.setInvoiceStatus(cardId, year, month, 'Paid', `${this.paidDateInput()}T00:00:00Z`).subscribe(() => {
      if (overpayment > 0 && overpaymentCategoryId && nextDueDate) {
        this.transactionService
          .create({
            accountId: null,
            creditCardId: cardId,
            categoryId: overpaymentCategoryId,
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
          })
          .subscribe(() => {
            this.isPickingPaidDate.set(false);
            this.refreshTrigger.update((n) => n + 1);
          });
        return;
      }

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

  // Mesma lógica de transaction-form.ts: item avulso pede confirmação simples; item que
  // faz parte de uma série (fixa ou parcelada, ex: "Fatura parcelada" 1/5) oferece excluir
  // só esta ocorrência ou esta e todas as próximas PENDENTES da série. Via ConfirmDialog
  // (ver template) em vez de confirm() nativo — dois confirm() encadeados era fácil de
  // clicar errado e acabar não excluindo nada sem perceber.
  readonly pendingSimpleDelete = signal<{ id: string; description: string } | null>(null);
  readonly pendingSeriesDelete = signal<{ id: string; description: string } | null>(null);

  deleteItem(id: string, description: string, recurrenceGroupId: string | null): void {
    if (recurrenceGroupId === null) {
      this.pendingSimpleDelete.set({ id, description });
      return;
    }

    this.pendingSeriesDelete.set({ id, description });
  }

  cancelSimpleDelete(): void {
    this.pendingSimpleDelete.set(null);
  }

  confirmSimpleDelete(): void {
    const pending = this.pendingSimpleDelete();

    if (!pending) {
      return;
    }

    this.pendingSimpleDelete.set(null);
    this.transactionService.delete(pending.id).subscribe(() => this.refreshTrigger.update((n) => n + 1));
  }

  cancelSeriesDelete(): void {
    this.pendingSeriesDelete.set(null);
  }

  confirmDeleteOnlyThis(): void {
    const pending = this.pendingSeriesDelete();

    if (!pending) {
      return;
    }

    this.pendingSeriesDelete.set(null);
    this.transactionService.delete(pending.id).subscribe(() => this.refreshTrigger.update((n) => n + 1));
  }

  confirmDeleteWholeSeries(): void {
    const pending = this.pendingSeriesDelete();

    if (!pending) {
      return;
    }

    this.pendingSeriesDelete.set(null);
    this.transactionService.deleteSeries(pending.id).subscribe(() => this.refreshTrigger.update((n) => n + 1));
  }
}
