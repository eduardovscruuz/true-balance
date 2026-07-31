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
import { SubcategoryService } from '../../core/services/subcategory.service';
import { TransactionService } from '../../core/services/transaction.service';
import { resolveLucideIconName } from '../../shared/utils/lucide-icon.util';
import {
  PAYMENT_TIMING_BADGE_CLASS,
  PAYMENT_TIMING_LABEL,
  PaymentTiming,
  STATUS_BADGE_BASE_CLASS,
  computePaymentTiming,
} from '../../shared/utils/payment-status.util';

export interface CashFlowDetailItem {
  description: string;
  amount: number;
}

export interface DayCashFlow {
  date: Date;
  totalIncome: number;
  totalExpense: number;
  dailyBalance: number;
  incomeDetails: CashFlowDetailItem[];
  expenseDetails: CashFlowDetailItem[];
}

export interface SubcategorySummaryRow {
  subcategoryId: string | null;
  subcategoryName: string;
  total: number;
  // Só preenchido nas linhas sintéticas de fatura de cartão (ver creditCardSummaryRow) —
  // subcategorias de verdade nunca têm isso.
  paymentTiming?: PaymentTiming | null;
}

export interface MonthSummaryTransactionItem {
  description: string;
  amount: number;
}

export interface MonthSummaryRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  type: 'Income' | 'Expense';
  total: number;
  // Vazio quando nenhuma transação da categoria usa subcategoria — nesse caso a linha
  // não é expansível por subcategoria, mas ainda expande pra mostrar as transações
  // (ver transactionItems) — "quantas transações somaram esse valor" nunca fica sem resposta.
  subcategories: SubcategorySummaryRow[];
  // Cada transação que compõe o total desta categoria, em ordem cronológica — usado
  // como expansão alternativa quando não há subcategoria pra detalhar.
  transactionItems: MonthSummaryTransactionItem[];
}

// Forma mínima usada pro cálculo de fluxo de caixa/saldo — Transaction já satisfaz isso
// estruturalmente, então serve tanto pras transações reais quanto pras faturas de cartão
// sintéticas (ver cardInvoiceEntriesForAccount) sem precisar de um objeto Transaction completo.
interface CashFlowEntry {
  date: string;
  type: 'Income' | 'Expense' | 'Transfer';
  amount: number;
  description: string;
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
  private readonly subcategoryService = inject(SubcategoryService);
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
  private readonly subcategories = toSignal(this.subcategoryService.getAll(), { initialValue: [] });

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
  // vencimento. Agrupa por Data EFETIVA (PaidDate, se já foi paga — senão o vencimento)
  // porque compras do mesmo cartão na mesma fatura já compartilham a mesma data efetiva;
  // o líquido (compras menos estornos) vira uma única entrada sintética, despesa se
  // positivo, "receita" (crédito) se as devoluções superarem as compras daquela fatura.
  // Usar PaidDate aqui é o que faz uma fatura paga ANTES do vencimento (ex: paga hoje,
  // vence só mês que vem) já aparecer batendo no saldo/linha do tempo de HOJE, não só
  // quando o vencimento chegar.
  private cardInvoiceEntriesForAccount(accountId: string): CashFlowEntry[] {
    const linkedCards = this.creditCards().filter((card) => card.paymentAccountId === accountId);

    if (linkedCards.length === 0) {
      return [];
    }

    const cardById = new Map(linkedCards.map((card) => [card.id, card]));
    // Chave por cartão + data (não só data) — se dois cartões vinculados vencerem no
    // mesmo dia, cada fatura continua aparecendo como uma linha própria no detalhamento
    // (ver openDayDetail), em vez de virar um número só sem saber de qual cartão veio.
    const netByCardAndDate = new Map<string, number>();

    for (const transaction of this.allTransactions()) {
      if (transaction.creditCardId === null || !cardById.has(transaction.creditCardId)) {
        continue;
      }

      const effectiveDate = transaction.paidDate ?? transaction.date;
      const key = `${transaction.creditCardId}|${effectiveDate}`;
      const delta = this.accountDelta(transaction);
      netByCardAndDate.set(key, (netByCardAndDate.get(key) ?? 0) + delta);
    }

    return [...netByCardAndDate.entries()].map(([key, netDelta]) => {
      const [cardId, date] = key.split('|');
      return {
        date,
        type: netDelta < 0 ? ('Expense' as const) : ('Income' as const),
        amount: Math.abs(netDelta),
        description: `Fatura ${cardById.get(cardId)?.name ?? 'Cartão'}`,
      };
    });
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

  // Entradas/saídas do mês selecionado, por conta — inclui a fatura de cartão vinculada
  // (se vencer neste mês) junto com as saídas, já que ela é um gasto real da conta.
  private readonly monthlyFlowByAccountId = computed(() => {
    const transactions = this.rawTransactions();
    const year = this.selectedYear();
    const month = this.selectedMonth();

    if (transactions === undefined) {
      return new Map<string, { income: number; expense: number }>();
    }

    return new Map(
      this.accounts().map((account) => {
        const ownThisMonth = transactions.filter((t) => t.accountId === account.id);
        const cardEntriesThisMonth = this.cardInvoiceEntriesForAccount(account.id).filter((entry) => {
          const date = new Date(entry.date);
          return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
        });

        const entries: CashFlowEntry[] = [...ownThisMonth, ...cardEntriesThisMonth];
        const income = entries.filter((t) => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0);
        const expense = entries.filter((t) => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0);

        return [account.id, { income, expense }];
      }),
    );
  });

  readonly displayedBalances = computed(() => {
    const showCurrent = this.isCurrentMonth();
    const projectedByAccountId = this.projectedBalanceByAccountId();
    const flowByAccountId = this.monthlyFlowByAccountId();

    return this.accounts().map((account) => {
      const flow = flowByAccountId.get(account.id) ?? { income: 0, expense: 0 };
      const endOfMonthBalance = projectedByAccountId.get(account.id) ?? account.balance;

      return {
        accountId: account.id,
        name: account.name,
        color: account.color,
        balance: showCurrent ? account.currentBalance : endOfMonthBalance,
        monthlyIncome: flow.income,
        monthlyExpense: flow.expense,
        endOfMonthBalance,
      };
    });
  });

  readonly daySortDirection = signal<'asc' | 'desc'>('asc');

  toggleDaySort(): void {
    this.daySortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
  }

  readonly dayDetailModal = signal<{ label: string; date: Date; items: CashFlowDetailItem[]; total: number } | null>(
    null,
  );

  openDayDetail(day: DayCashFlow, kind: 'income' | 'expense'): void {
    this.dayDetailModal.set({
      label: kind === 'income' ? 'Receitas' : 'Despesas',
      date: day.date,
      items: kind === 'income' ? day.incomeDetails : day.expenseDetails,
      total: kind === 'income' ? day.totalIncome : day.totalExpense,
    });
  }

  closeDayDetail(): void {
    this.dayDetailModal.set(null);
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

      const incomeDetails = dayTransactions
        .filter((t) => t.type === 'Income')
        .map((t) => ({ description: t.description, amount: t.amount }));
      const expenseDetails = dayTransactions
        .filter((t) => t.type === 'Expense')
        .map((t) => ({ description: t.description, amount: t.amount }));

      const totalIncome = incomeDetails.reduce((sum, t) => sum + t.amount, 0);
      const totalExpense = expenseDetails.reduce((sum, t) => sum + t.amount, 0);

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
        incomeDetails,
        expenseDetails,
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

  // Categorias com a linha expandida (mostrando a quebra por subcategoria) no Resumo do
  // Mês — fechada por padrão, já que a maioria das vezes só o total mesmo já basta.
  readonly resolveIconName = resolveLucideIconName;

  readonly paymentTimingLabel = PAYMENT_TIMING_LABEL;
  readonly statusBadgeBaseClass = STATUS_BADGE_BASE_CLASS;
  readonly paymentTimingBadgeClass = PAYMENT_TIMING_BADGE_CLASS;

  private readonly expandedSummaryCategoryIds = signal(new Set<string>());

  isSummaryExpanded(categoryId: string): boolean {
    return this.expandedSummaryCategoryIds().has(categoryId);
  }

  // Toda linha expande pra mostrar de onde veio o total — por subcategoria quando
  // existe mais de uma, senão pela lista de transações que somaram esse valor.
  hasSummaryBreakdown(summary: MonthSummaryRow): boolean {
    return summary.subcategories.length > 0 || summary.transactionItems.length > 0;
  }

  toggleSummaryExpanded(categoryId: string): void {
    this.expandedSummaryCategoryIds.update((current) => {
      const next = new Set(current);

      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }

      return next;
    });
  }

  // Calculado a partir das transações do mês (não da monthly_summaries, que só é
  // preenchida pelo rollup depois de 3 meses e nem tem AccountId pra filtrar por conta).
  readonly monthSummary = computed<MonthSummaryRow[] | undefined>(() => {
    const transactions = this.accountTransactions();

    if (transactions === undefined) {
      return undefined;
    }

    const categoryById = new Map(this.categories().map((category) => [category.id, category]));
    const subcategoryById = new Map(this.subcategories().map((subcategory) => [subcategory.id, subcategory]));
    const totals = new Map<string, MonthSummaryRow>();
    // Chave composta categoria+subcategoria — mesma subcategoria de categorias diferentes
    // (não deveria acontecer, mas não custa ser explícito) não pode se misturar.
    const subtotals = new Map<string, Map<string, SubcategorySummaryRow>>();
    const transactionItemsByCategory = new Map<string, { date: string; item: MonthSummaryTransactionItem }[]>();

    for (const transaction of transactions) {
      if (transaction.type === 'Transfer') {
        continue;
      }

      const existing = totals.get(transaction.categoryId);

      if (existing) {
        existing.total += transaction.amount;
      } else {
        const category = categoryById.get(transaction.categoryId);
        totals.set(transaction.categoryId, {
          categoryId: transaction.categoryId,
          categoryName: category?.name ?? '—',
          categoryColor: category?.color ?? null,
          categoryIcon: category?.icon ?? null,
          type: transaction.type,
          total: transaction.amount,
          subcategories: [],
          transactionItems: [],
        });
      }

      // Transações sem subcategoria caem no balde "Outros" — sem isso, a soma das
      // subcategorias expandidas não bateria com o total da categoria.
      const subcategoryKey = transaction.subcategoryId ?? 'none';
      const categorySubtotals = subtotals.get(transaction.categoryId) ?? new Map<string, SubcategorySummaryRow>();
      const existingSubtotal = categorySubtotals.get(subcategoryKey);

      if (existingSubtotal) {
        existingSubtotal.total += transaction.amount;
      } else {
        categorySubtotals.set(subcategoryKey, {
          subcategoryId: transaction.subcategoryId,
          subcategoryName: transaction.subcategoryId
            ? (subcategoryById.get(transaction.subcategoryId)?.name ?? '—')
            : 'Outros',
          total: transaction.amount,
        });
      }

      subtotals.set(transaction.categoryId, categorySubtotals);

      const categoryItems = transactionItemsByCategory.get(transaction.categoryId) ?? [];
      categoryItems.push({
        date: transaction.date,
        item: { description: transaction.description, amount: transaction.amount },
      });
      transactionItemsByCategory.set(transaction.categoryId, categoryItems);
    }

    const rows = [...totals.values()].map((row) => {
      // "Outros" (sem subcategoria) sempre por último — é um resto genérico, não faz
      // sentido competir em destaque com subcategorias nomeadas de propósito.
      const categorySubtotals = [...(subtotals.get(row.categoryId)?.values() ?? [])].sort((a, b) =>
        a.subcategoryId === null ? 1 : b.subcategoryId === null ? -1 : 0,
      );

      // Só vale a pena expandir por subcategoria se houver mais de um balde — uma
      // categoria onde tudo caiu em "Outros" não tem nada de novo pra mostrar aí.
      const subcategories = categorySubtotals.length > 1 ? categorySubtotals : [];

      // A lista de transações só é usada (ver template) quando não há quebra por
      // subcategoria — senão o usuário já vê o detalhe por outro caminho.
      const transactionItems = (transactionItemsByCategory.get(row.categoryId) ?? [])
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((entry) => entry.item);

      return { ...row, subcategories, transactionItems };
    });

    const cardRow = this.creditCardSummaryRow();
    return cardRow ? [...rows, cardRow] : rows;
  });

  // Compras no cartão têm accountId nulo (ver Transaction), então nunca entram no loop
  // acima (que só olha accountTransactions()) — sem isso, cartão simplesmente sumia do
  // Resumo do Mês. Sintetiza uma linha "Cartão" agrupando o gasto líquido do mês por
  // cartão vinculado a esta conta, igual uma categoria comum com quebra por subcategoria
  // — mas sem precisar criar uma Category de verdade nem um CategoryId no CreditCard: o
  // Color/Icon que cada cartão já tem (ver Fase de credit-card-form) já resolve a
  // identidade visual, e essa quebra é só de EXIBIÇÃO — as categorias reais de cada item
  // da fatura continuam intocadas em Transações do Mês.
  private creditCardSummaryRow(): MonthSummaryRow | null {
    const activeAccountId = this.activeAccountId();
    const linkedCards = this.creditCards().filter((card) => card.paymentAccountId === activeAccountId);

    if (linkedCards.length === 0) {
      return null;
    }

    const year = this.selectedYear();
    const month = this.selectedMonth();
    const linkedCardIds = new Set(linkedCards.map((card) => card.id));
    const cardById = new Map(linkedCards.map((card) => [card.id, card]));
    // Chave por cartão + mês de VENCIMENTO (não só cartão) — mesmo problema já corrigido
    // em Transações do Mês: a fatura de julho paga em dia e a de agosto paga adiantada
    // podem cair no mesmo mês EFETIVO (ambas pagas em julho), mas são faturas diferentes.
    // Somar as duas num "Intercard" só dava a entender que julho sozinho custou o total
    // das duas juntas.
    const netByCardAndDueMonth = new Map<
      string,
      { cardId: string; dueDate: string; net: number; paidDate: string | null; allPaid: boolean }
    >();

    for (const transaction of this.allTransactions()) {
      if (
        transaction.creditCardId === null ||
        transaction.type === 'Transfer' ||
        !linkedCardIds.has(transaction.creditCardId)
      ) {
        continue;
      }

      // Data efetiva decide se a compra entra no mês selecionado (paga, se já foi —
      // senão o vencimento); o vencimento em si (transaction.date) decide de QUAL fatura.
      const effectiveDate = new Date(transaction.paidDate ?? transaction.date);

      if (effectiveDate.getUTCFullYear() !== year || effectiveDate.getUTCMonth() + 1 !== month) {
        continue;
      }

      const dueDate = new Date(transaction.date);
      const key = `${transaction.creditCardId}|${dueDate.getUTCFullYear()}-${dueDate.getUTCMonth() + 1}`;
      const delta = transaction.type === 'Expense' ? transaction.amount : -transaction.amount;
      const isPaid = transaction.status === 'Paid';
      const existing = netByCardAndDueMonth.get(key);

      if (existing) {
        existing.net += delta;
        existing.allPaid = existing.allPaid && isPaid;
        // Fatura é atômica (paga ou não, nunca "meio paga" — ver SetInvoiceStatusAsync),
        // então todo item do grupo compartilha o mesmo PaidDate; qualquer um serve.
        existing.paidDate = existing.paidDate ?? transaction.paidDate;
      } else {
        netByCardAndDueMonth.set(key, {
          cardId: transaction.creditCardId,
          dueDate: transaction.date,
          net: delta,
          paidDate: transaction.paidDate,
          allPaid: isPaid,
        });
      }
    }

    const invoiceBreakdown = [...netByCardAndDueMonth.values()].filter((entry) => entry.net !== 0);

    if (invoiceBreakdown.length === 0) {
      return null;
    }

    const totalNet = invoiceBreakdown.reduce((sum, entry) => sum + entry.net, 0);

    if (totalNet === 0) {
      return null;
    }

    return {
      categoryId: '__creditCards__',
      categoryName: 'Cartões',
      categoryColor: '#000000',
      categoryIcon: 'credit-card',
      type: totalNet > 0 ? 'Expense' : 'Income',
      total: Math.abs(totalNet),
      // Sempre expande, mesmo com uma fatura só — diferente de subcategoria de verdade,
      // o rótulo "Cartões" não diz QUAL cartão, então mesmo uma única fatura vale a pena
      // abrir pra confirmar de qual cartão ela é.
      subcategories: invoiceBreakdown.map((entry) => {
        const cardName = cardById.get(entry.cardId)?.name ?? '—';
        const rawMonthLabel = new Date(entry.dueDate).toLocaleDateString('pt-BR', {
          month: 'long',
          timeZone: 'UTC',
        });
        const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

        return {
          subcategoryId: `${entry.cardId}|${entry.dueDate}`,
          subcategoryName: `${cardName} - Fatura de ${monthLabel}`,
          total: Math.abs(entry.net),
          // Deriva de PaidDate/Date na hora, em vez de guardar num campo à parte — os
          // dois já existem no banco, e um status guardado seria uma segunda fonte de
          // verdade que precisaria ficar sincronizada toda vez que PaidDate ou Date
          // mudassem (o mesmo risco já discutido pra fatura-como-transação-agregada).
          paymentTiming: entry.allPaid && entry.paidDate ? computePaymentTiming(entry.paidDate, entry.dueDate) : null,
        };
      }),
      transactionItems: [],
    };
  }

  // Duas colunas lado a lado (Receitas / Despesas) em vez de uma lista só — mais fácil
  // de comparar os dois de relance, sem misturar tipos diferentes na mesma coluna.
  readonly incomeSummary = computed(() => this.monthSummary()?.filter((row) => row.type === 'Income'));
  readonly expenseSummary = computed(() => this.monthSummary()?.filter((row) => row.type === 'Expense'));

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

  // Mesma convenção do saldo da conta (AccountService): receita soma, despesa e
  // transferência subtraem.
  private accountDelta(transaction: CashFlowEntry): number {
    return transaction.type === 'Income' ? transaction.amount : -transaction.amount;
  }
}
