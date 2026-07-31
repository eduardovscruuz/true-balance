import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map, switchMap } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

import { InitialsPipe } from '../../shared/pipes/initials.pipe';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { MonthSelectionService } from '../../core/services/month-selection.service';
import { ReportService } from '../../core/services/report.service';
import { TransactionService } from '../../core/services/transaction.service';

export interface DayCashFlow {
  date: Date;
  totalIncome: number;
  totalExpense: number;
  dailyBalance: number;
}

export interface MonthSummaryRow {
  categoryId: string;
  categoryName: string;
  type: 'Income' | 'Expense';
  total: number;
}

// Forma mínima usada pro cálculo de fluxo de caixa/saldo — Transaction já satisfaz isso
// estruturalmente, então serve tanto pras transações reais quanto pras faturas de cartão
// sintéticas (ver cardInvoiceEntriesForAccount) sem precisar de um objeto Transaction completo.
interface CashFlowEntry {
  date: string;
  type: 'Income' | 'Expense' | 'Transfer';
  amount: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DatePipe, InitialsPipe, LucideAngularModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly reportService = inject(ReportService);
  private readonly transactionService = inject(TransactionService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly creditCardService = inject(CreditCardService);
  // Mês selecionado é global (seletor único na barra de navegação, ver app.html) —
  // esta tela só lê os signals, nunca tem o próprio estado de mês.
  private readonly monthSelection = inject(MonthSelectionService);

  private readonly rawAccounts = toSignal(this.accountService.getAll(), { initialValue: [] });

  // A conta Corrente sempre aparece primeiro nos cards, independente do saldo — o
  // backend não garante nenhuma ordem específica, então ordenamos aqui. As demais
  // mantêm a ordem relativa entre si (sort estável).
  readonly accounts = computed(() =>
    [...this.rawAccounts()].sort((a, b) => Number(b.type === 'Checking') - Number(a.type === 'Checking')),
  );
  private readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });

  // Histórico completo (não só o mês selecionado) — precisamos dele pra calcular o
  // saldo ACUMULADO até um dia qualquer, não só o fluxo daquele mês isoladamente.
  private readonly allTransactions = toSignal(this.transactionService.getAll(), { initialValue: [] });
  private readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });

  // null = nenhuma escolha manual ainda; usa o padrão (conta Corrente, ou a primeira que existir).
  private readonly selectedAccountId = signal<string | null>(null);

  private readonly defaultAccountId = computed(() => {
    const list = this.accounts();
    return list.find((account) => account.type === 'Checking')?.id ?? list[0]?.id ?? null;
  });

  readonly activeAccountId = computed(() => this.selectedAccountId() ?? this.defaultAccountId());

  selectAccount(accountId: string): void {
    this.selectedAccountId.set(accountId);
  }

  private readonly selectedYear = computed(() => this.monthSelection.selectedYear());
  private readonly selectedMonth = computed(() => this.monthSelection.selectedMonth());

  private readonly yearMonth = computed(() => ({
    year: this.selectedYear(),
    month: this.selectedMonth(),
  }));

  private readonly yearMonth$ = toObservable(this.yearMonth);

  // Saldos são anuais: só refaz a chamada quando o ANO muda, não a cada troca de mês.
  private readonly rawBalances = toSignal(
    this.yearMonth$.pipe(
      map(({ year }) => year),
      distinctUntilChanged(),
      switchMap((year) => this.reportService.getBalances(year)),
    ),
  );

  readonly balances = computed(() => this.rawBalances()?.filter((b) => b.accountId === this.activeAccountId()));

  private readonly rawTransactions = toSignal(
    this.yearMonth$.pipe(switchMap(({ year, month }) => this.transactionService.getByMonth(year, month))),
  );

  private readonly accountTransactions = computed(() =>
    this.rawTransactions()?.filter((t) => t.accountId === this.activeAccountId()),
  );

  private readonly allAccountTransactions = computed(() =>
    this.allTransactions().filter((t) => t.accountId === this.activeAccountId()),
  );

  private readonly activeAccountStartingBalance = computed(
    () => this.accounts().find((a) => a.id === this.activeAccountId())?.balance ?? 0,
  );

  // Uma compra no cartão só afeta o fluxo de caixa/projeção de saldo da conta que vai
  // PAGAR a fatura (vínculo configurado no cadastro do cartão) — sem isso, ela fica
  // invisível pra qualquer conta, mesmo sendo um gasto real que vai sair dali no
  // vencimento. Agrupa por Data (o vencimento — ver TransactionForm) porque compras do
  // mesmo cartão na mesma fatura já compartilham a mesma data; o líquido (compras menos
  // estornos) vira uma única entrada sintética, despesa se positivo, "receita" (crédito)
  // se as devoluções superarem as compras daquela fatura.
  private cardInvoiceEntriesForAccount(accountId: string): CashFlowEntry[] {
    const linkedCardIds = new Set(
      this.creditCards()
        .filter((card) => card.paymentAccountId === accountId)
        .map((card) => card.id),
    );

    if (linkedCardIds.size === 0) {
      return [];
    }

    const netByDate = new Map<string, number>();

    for (const transaction of this.allTransactions()) {
      if (transaction.creditCardId === null || !linkedCardIds.has(transaction.creditCardId)) {
        continue;
      }

      const delta = this.accountDelta(transaction);
      netByDate.set(transaction.date, (netByDate.get(transaction.date) ?? 0) + delta);
    }

    return [...netByDate.entries()].map(([date, netDelta]) => ({
      date,
      type: netDelta < 0 ? ('Expense' as const) : ('Income' as const),
      amount: Math.abs(netDelta),
    }));
  }

  private readonly cardInvoiceEntriesForActiveAccount = computed(() => {
    const accountId = this.activeAccountId();
    return accountId === null ? [] : this.cardInvoiceEntriesForAccount(accountId);
  });

  private readonly today = new Date();

  // Mostrando o mês atual de verdade: o card mostra o saldo REAL de hoje (Saldo Atual).
  // Mostrando qualquer outro mês (passado ou futuro): não faz sentido mostrar "quanto eu
  // tenho hoje" — mostra a previsão de saldo no FIM daquele mês em vez disso. Pra ver o
  // saldo de hoje de novo, é só voltar pro mês atual.
  readonly isCurrentMonth = computed(
    () => this.selectedYear() === this.today.getFullYear() && this.selectedMonth() === this.today.getMonth() + 1,
  );

  readonly balanceSectionTitle = computed(() =>
    this.isCurrentMonth() ? 'Saldo Atual' : 'Previsão de Saldo (fim do mês)',
  );

  private readonly projectedBalanceByAccountId = computed(() => {
    const year = this.selectedYear();
    const month = this.selectedMonth();
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthEndMs = Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999);
    const allTransactions = this.allTransactions();

    return new Map(
      this.accounts().map((account) => {
        const ownEntries = allTransactions.filter((t) => t.accountId === account.id);
        const cardEntries = this.cardInvoiceEntriesForAccount(account.id);

        const cumulativeDelta = [...ownEntries, ...cardEntries]
          .filter((t) => new Date(t.date).getTime() <= monthEndMs)
          .reduce((sum, t) => sum + this.accountDelta(t), 0);

        return [account.id, account.balance + cumulativeDelta];
      }),
    );
  });

  readonly displayedBalances = computed(() => {
    const showCurrent = this.isCurrentMonth();
    const projectedByAccountId = this.projectedBalanceByAccountId();

    return this.accounts().map((account) => ({
      accountId: account.id,
      name: account.name,
      color: account.color,
      balance: showCurrent ? account.currentBalance : (projectedByAccountId.get(account.id) ?? account.balance),
    }));
  });

  readonly daySortDirection = signal<'asc' | 'desc'>('asc');

  toggleDaySort(): void {
    this.daySortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
  }

  private readonly unsortedDailyCashFlow = computed<DayCashFlow[] | undefined>(() => {
    const realTransactions = this.accountTransactions();

    if (realTransactions === undefined) {
      return undefined;
    }

    const year = this.selectedYear();
    const month = this.selectedMonth();
    const daysInMonth = new Date(year, month, 0).getDate();
    const startingBalance = this.activeAccountStartingBalance();
    const cardEntries = this.cardInvoiceEntriesForActiveAccount();
    // Fatura de cartão entra aqui igual a qualquer outra transação da conta — só assim
    // ela some no fluxo do dia e na projeção de saldo (ver cardInvoiceEntriesForAccount).
    const transactions: CashFlowEntry[] = [...realTransactions, ...cardEntries];
    const allTransactions: CashFlowEntry[] = [...this.allAccountTransactions(), ...cardEntries];

    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dayTransactions = this.transactionsForDay(transactions, year, month, day);

      const totalIncome = this.sumByType(dayTransactions, 'Income');
      const totalExpense = this.sumByType(dayTransactions, 'Expense');

      // Saldo do dia é o saldo ACUMULADO da conta até o fim deste dia (saldo inicial +
      // tudo que entrou/saiu desde o começo da conta até aqui) — não o fluxo isolado
      // deste dia. Um dia sem nenhuma transação ainda tem saldo (o que já tinha antes),
      // não R$ 0,00. Segue a mesma convenção do saldo atual da conta: receita soma,
      // despesa e transferência subtraem.
      const dayEndMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
      const cumulativeDelta = allTransactions
        .filter((t) => new Date(t.date).getTime() <= dayEndMs)
        .reduce((sum, t) => sum + this.accountDelta(t), 0);

      return {
        date: new Date(year, month - 1, day),
        totalIncome,
        totalExpense,
        dailyBalance: startingBalance + cumulativeDelta,
      };
    });
  });

  readonly dailyCashFlow = computed<DayCashFlow[] | undefined>(() => {
    const days = this.unsortedDailyCashFlow();

    if (days === undefined) {
      return undefined;
    }

    const sorted = [...days];

    if (this.daySortDirection() === 'desc') {
      sorted.reverse();
    }

    return sorted;
  });

  // Calculado a partir das transações do mês (não da monthly_summaries, que só é
  // preenchida pelo rollup depois de 3 meses e nem tem AccountId pra filtrar por conta).
  readonly monthSummary = computed<MonthSummaryRow[] | undefined>(() => {
    const transactions = this.accountTransactions();

    if (transactions === undefined) {
      return undefined;
    }

    const categoryById = new Map(this.categories().map((category) => [category.id, category]));
    const totals = new Map<string, MonthSummaryRow>();

    for (const transaction of transactions) {
      if (transaction.type === 'Transfer') {
        continue;
      }

      const existing = totals.get(transaction.categoryId);

      if (existing) {
        existing.total += transaction.amount;
      } else {
        totals.set(transaction.categoryId, {
          categoryId: transaction.categoryId,
          categoryName: categoryById.get(transaction.categoryId)?.name ?? '—',
          type: transaction.type,
          total: transaction.amount,
        });
      }
    }

    return [...totals.values()];
  });

  private transactionsForDay<T extends CashFlowEntry>(transactions: T[], year: number, month: number, day: number): T[] {
    // Usa os getters UTC de propósito: o backend serializa a data como meia-noite UTC
    // (ex: "2026-07-05T00:00:00Z"), representando um dia-calendário, não um instante.
    // Ler com getDate()/getMonth() locais deslocaria isso um dia pra trás em fusos
    // atrás de UTC (ex: America/Sao_Paulo), jogando a transação no dia errado.
    return transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
    });
  }

  // Transferências entre contas próprias não representam ganho nem gasto real,
  // então ficam de fora das duas somas (ficariam duplicadas/distorcendo o saldo do dia).
  private sumByType(transactions: CashFlowEntry[], type: 'Income' | 'Expense'): number {
    return transactions.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0);
  }

  // Mesma convenção do saldo da conta (AccountService): receita soma, despesa e
  // transferência subtraem.
  private accountDelta(transaction: CashFlowEntry): number {
    return transaction.type === 'Income' ? transaction.amount : -transaction.amount;
  }
}
