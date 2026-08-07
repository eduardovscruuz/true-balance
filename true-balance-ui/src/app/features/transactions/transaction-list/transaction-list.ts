import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { MonthSelectionService } from '../../../core/services/month-selection.service';
import { PayInvoiceModalService } from '../../../core/services/pay-invoice-modal.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TransactionModalService } from '../../../core/services/transaction-modal.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { CreateTransaction, Transaction } from '../../../core/models/transaction.model';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { TransactionTable } from '../../../shared/ui-components/transaction-table/transaction-table';
import { computePaymentTiming } from '../../../shared/utils/payment-status.util';

@Component({
  selector: 'app-transaction-list',
  imports: [LucideAngularModule, TransactionTable, FormsModule, CurrencyMaskDirective],
  templateUrl: './transaction-list.html',
  styleUrl: './transaction-list.scss',
})
export class TransactionList {
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly accountService = inject(AccountService);
  // Mês selecionado é global (seletor único na barra de navegação, ver app.html) —
  // esta tela só lê os signals, nunca tem o próprio estado de mês.
  private readonly monthSelection = inject(MonthSelectionService);
  protected readonly transactionModal = inject(TransactionModalService);
  protected readonly payInvoiceModal = inject(PayInvoiceModalService);

  private readonly refreshTrigger = signal(0);

  // Busca tudo (não só o mês) porque o filtro de mês aqui é pela data EFETIVA (ver
  // `transactions` abaixo) — uma fatura de cartão paga adiantado (PaidDate num mês
  // diferente do vencimento/Date) precisa aparecer no mês em que foi realmente paga,
  // não só no mês do vencimento, e isso só dá pra saber olhando todo o histórico.
  private readonly allTransactions = toSignal(
    toObservable(this.refreshTrigger).pipe(switchMap(() => this.transactionService.getAll())),
  );

  private readonly transactions = computed(() => {
    const all = this.allTransactions();

    if (all === undefined) {
      return undefined;
    }

    const year = this.monthSelection.selectedYear();
    const month = this.monthSelection.selectedMonth();

    return all.filter((t) => {
      const effectiveDate = new Date(t.paidDate ?? t.date);
      return effectiveDate.getUTCFullYear() === year && effectiveDate.getUTCMonth() + 1 === month;
    });
  });

  private readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });
  private readonly subcategories = toSignal(this.subcategoryService.getAll(), { initialValue: [] });
  private readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });
  private readonly accounts = toSignal(this.accountService.getAll(), { initialValue: [] });

  // Agrupar por dia (ver TransactionTable) exige que a lista esteja ordenada por data —
  // por isso, diferente da versão antiga, só existe ordenação por data aqui (mesmo padrão
  // de toggle asc/desc já usado na Fatura do Cartão).
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  toggleSort(): void {
    this.sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
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
    const accountById = new Map(this.accounts().map((account) => [account.id, account]));

    const accountTransactions = transactions.filter((t) => t.creditCardId === null);
    const cardTransactions = transactions.filter((t) => t.creditCardId !== null);

    const transactionRows = accountTransactions.map((transaction) => {
      const category = categoryById.get(transaction.categoryId);
      const subcategory = transaction.subcategoryId ? subcategoryById.get(transaction.subcategoryId) : undefined;
      const account = transaction.accountId ? accountById.get(transaction.accountId) : undefined;
      return {
        kind: 'transaction' as const,
        ...transaction,
        categoryName: subcategory?.name ?? category?.name ?? '—',
        categoryColor: category?.color ?? null,
        categoryIcon: category?.icon ?? null,
        accountName: account?.name ?? '—',
        accountColor: account?.color ?? null,
      };
    });

    // Agrupa por cartão + mês de VENCIMENTO (Date, não a data efetiva/paga) — duas
    // faturas diferentes do mesmo cartão (ex: a de julho paga em dia + a de agosto paga
    // adiantada, ambas com data efetiva em julho) são coisas DISTINTAS e não podem virar
    // uma linha só, mesmo aparecendo as duas neste mesmo mês por terem sido pagas juntas.
    const cardGroups = new Map<string, typeof cardTransactions>();
    for (const transaction of cardTransactions) {
      const dueDate = new Date(transaction.date);
      const groupKey = `${transaction.creditCardId}|${dueDate.getUTCFullYear()}-${dueDate.getUTCMonth() + 1}`;
      const list = cardGroups.get(groupKey) ?? [];
      list.push(transaction);
      cardGroups.set(groupKey, list);
    }

    const cardRows = [...cardGroups.values()].map((items) => {
      const creditCardId = items[0].creditCardId!;
      const creditCard = creditCardById.get(creditCardId);
      // A fatura sai da conta configurada como "Conta de Pagamento" no cadastro do
      // cartão (ver Dashboard) — sem esse vínculo, não dá pra saber de qual conta.
      const paymentAccount = creditCard?.paymentAccountId ? accountById.get(creditCard.paymentAccountId) : undefined;
      const paymentAccountName = paymentAccount?.name ?? (creditCard?.paymentAccountId ? '—' : 'Sem conta vinculada');

      // Mês do vencimento da fatura (não o mês efetivo/pago) — pra diferenciar na tela
      // "fatura de agosto" de "fatura de julho" mesmo quando as duas aparecem juntas
      // aqui por terem sido pagas no mesmo mês. Sem ano: o mês selecionado no topo da
      // tela já deixa isso implícito, então "de 2026" só polui a descrição.
      const dueDate = items[0].date;
      const rawMonthLabel = new Date(dueDate).toLocaleDateString('pt-BR', {
        month: 'long',
        timeZone: 'UTC',
      });
      // toLocaleDateString devolve o mês todo em minúsculas ("agosto") — capitaliza só a
      // primeira letra pra ficar "Agosto", já que aparece como início de frase na Descrição.
      const invoiceMonthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

      return {
        kind: 'cardInvoice' as const,
        creditCardId,
        cardName: creditCard?.name ?? '—',
        cardColor: creditCard?.color ?? null,
        cardIcon: creditCard?.icon ?? null,
        invoiceMonthLabel,
        dueYear: new Date(dueDate).getUTCFullYear(),
        dueMonth: new Date(dueDate).getUTCMonth() + 1,
        accountName: paymentAccountName,
        accountColor: paymentAccount?.color ?? null,
        // Data única exibida na tabela: quando foi PAGA, se já foi — senão o vencimento,
        // como referência até lá. Não faz sentido ter vencimento e "pago em" como duas
        // colunas separadas; pra ver o vencimento exato, a tela da fatura tem o detalhe.
        date: items[0].paidDate ?? dueDate,
        // Estorno (registrado como Receita no cartão) reduz o total da fatura, não soma
        // junto com as compras.
        amount: items.reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0),
        status: items.every((t) => t.status === 'Paid') ? ('Paid' as const) : ('Pending' as const),
        // Só faz sentido calcular quando a fatura inteira está paga (item[0].paidDate é
        // o mesmo pra todos — atômico, ver SetInvoiceStatusAsync) — Pendente não tem
        // data de pagamento nenhuma ainda.
        paymentTiming:
          items.every((t) => t.status === 'Paid') && items[0].paidDate
            ? computePaymentTiming(items[0].paidDate, dueDate)
            : null,
        itemCount: items.length,
      };
    });

    const multiplier = this.sortDirection() === 'asc' ? 1 : -1;

    return [...transactionRows, ...cardRows].sort((a, b) => a.date.localeCompare(b.date) * multiplier);
  });

  readonly confirmModal = signal<Transaction | null>(null);
  readonly confirmAmount = signal<number>(0);
  // Formato "yyyy-MM-dd" (o que o <input type="date"> espera) — pré-preenchido com hoje
  // (o caso mais comum), mas editável: nem todo pagamento é confirmado no mesmo dia em
  // que ele de fato aconteceu (ex: confirmando hoje um pagamento que já foi feito ontem).
  readonly confirmDate = signal<string>('');

  // Botão "Receber"/"Pagar" da tabela: abre modal de confirmação em vez de ir direto
  // pro formulário, já que o valor pode precisar de ajuste (ex: salário com hora extra,
  // desconto por pagar adiantado) antes de confirmar. O stopPropagation (evita disparar a
  // navegação da linha, que leva pra edição) já é feito dentro do TransactionTable.
  openConfirmModal(id: string): void {
    const transaction = this.allTransactions()?.find((t) => t.id === id);
    if (!transaction) {
      return;
    }

    this.confirmModal.set(transaction);
    this.confirmAmount.set(transaction.amount);
    this.confirmDate.set(this.todayAsInputValue());
  }

  closeConfirmModal(): void {
    this.confirmModal.set(null);
  }

  confirmPayment(): void {
    const transaction = this.confirmModal();
    if (!transaction) {
      return;
    }

    const { id, ...rest } = transaction;
    const dto: CreateTransaction = {
      ...rest,
      amount: this.confirmAmount(),
      status: 'Paid',
      // A data da transação passa a ser o dia em que ela foi de fato recebida/paga —
      // paidDate é reservado só pra fatura de cartão (ver Transaction.paidDate).
      date: `${this.confirmDate()}T00:00:00Z`,
    };

    this.transactionService.update(id, dto).subscribe(() => {
      this.confirmModal.set(null);
      this.refreshTrigger.update((n) => n + 1);
    });
  }

  private todayAsInputValue(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
