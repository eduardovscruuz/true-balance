import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

import { InitialsPipe } from '../../shared/pipes/initials.pipe';
import { AccountService } from '../../core/services/account.service';
import { AiModalService } from '../../core/services/ai-modal.service';
import { CategoryService } from '../../core/services/category.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { MonthSelectionService } from '../../core/services/month-selection.service';
import { SubcategoryService } from '../../core/services/subcategory.service';
import { TransactionModalService } from '../../core/services/transaction-modal.service';
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
  // Opcional — só os detalhamentos que cruzam vários meses (despesa fixa) mostram isso;
  // o da Linha do Tempo já é de um dia só, não precisa repetir.
  date?: string;
}

// Uma linha do modal de dívidas — ou o total agregado de UM cartão (dentro da seção
// "Cartões", sem detalhe de série: esse detalhe já existe na aba Cartões), ou uma SÉRIE
// de parcelas restantes dentro de uma categoria (count > 1 quando é uma compra parcelada
// com mais de uma ocorrência ainda pendente). "key" é o que o checkbox usa pra
// incluir/excluir do total — ver excludedDebtKeys.
export interface DebtLeaf {
  key: string;
  description: string;
  count: number;
  total: number;
}

export interface DebtSection {
  key: string;
  label: string;
  // Soma de TODOS os leaves, fixa — só usada pra ordenar as seções. O valor exibido de
  // verdade (que reage aos checkboxes marcados/desmarcados) vem de sectionTotal().
  total: number;
  leaves: DebtLeaf[];
}

export interface DayCashFlow {
  date: Date;
  totalIncome: number;
  totalExpense: number;
  dailyBalance: number;
  incomeDetails: CashFlowDetailItem[];
  expenseDetails: CashFlowDetailItem[];
}

// O que a Linha do Tempo Diária de fato renderiza — nem sempre um dia vira uma linha:
// 'pastToggle' é o link "Ver N dias anteriores/Esconder" (um só, que já troca de texto
// conforme expanded — ver template), e 'range' é uma faixa de dias FUTUROS consecutivos
// sem nenhum movimento (ex: "08/08 à 09/08") — ver compactZeroMovementRuns. Dias futuros
// sempre aparecem (sem toggle de esconder/mostrar) — só os que não têm NENHUM movimento
// (nem receita nem despesa) é que colapsam numa faixa.
export type DailyTimelineRow =
  | { kind: 'day'; day: DayCashFlow }
  | { kind: 'range'; startDate: Date; endDate: Date; dailyBalance: number }
  | { kind: 'pastToggle'; expanded: boolean; count: number };

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
  private readonly transactionService = inject(TransactionService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly creditCardService = inject(CreditCardService);
  // Mês selecionado é global (seletor único na barra de navegação, ver app.html) —
  // esta tela só lê os signals, nunca tem o próprio estado de mês.
  private readonly monthSelection = inject(MonthSelectionService);
  protected readonly transactionModal = inject(TransactionModalService);
  protected readonly aiModal = inject(AiModalService);

  // Contas e transações rebuscam sempre que TransactionService.refresh mudar — sem isso,
  // salvar "Nova Despesa" pelo modal (que não navega, então o Dashboard nunca seria
  // recriado) deixaria a tela com dado velho até um F5. Mesmo padrão de refreshTrigger já
  // usado em transaction-list.ts, só que a fonte do "mudou" é global (TransactionService),
  // não local — porque quem salva é um componente diferente (o modal), não esta tela.
  private readonly rawAccounts = toSignal(
    toObservable(this.transactionService.refresh).pipe(switchMap(() => this.accountService.getAll())),
    { initialValue: [] },
  );

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
  private readonly allTransactions = toSignal(
    toObservable(this.transactionService.refresh).pipe(switchMap(() => this.transactionService.getAll())),
    { initialValue: [] },
  );
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

  // Data da transação (ou fatura vinculada) mais antiga desta conta — não faz sentido
  // mostrar "Saldos Mensais" pra um mês anterior a isso: seria só repetir o saldo de
  // abertura da conta sem nenhum dado real por trás.
  private readonly earliestActiveAccountDateMs = computed(() => {
    const accountId = this.activeAccountId();

    if (accountId === null) {
      return null;
    }

    const linkedCardIds = new Set(
      this.creditCards()
        .filter((card) => card.paymentAccountId === accountId)
        .map((card) => card.id),
    );

    const dates = this.allTransactions()
      .filter((t) => t.accountId === accountId || (t.creditCardId !== null && linkedCardIds.has(t.creditCardId)))
      .map((t) => new Date(t.paidDate ?? t.date).getTime());

    return dates.length > 0 ? Math.min(...dates) : null;
  });

  // Mesmo cálculo da Previsão de Saldo (saldo de abertura + delta acumulado), mas só com
  // transações PAGAS — saldo histórico de um mês já fechado é um fato assentado, não uma
  // projeção, então pendente (que ainda pode mudar ou nem acontecer) não conta aqui.
  private paidCumulativeDeltaUpTo(accountId: string, cutoffMs: number): number {
    const ownDelta = this.allTransactions()
      .filter((t) => t.accountId === accountId && t.status === 'Paid')
      .filter((t) => new Date(t.date).getTime() <= cutoffMs)
      .reduce((sum, t) => sum + this.accountDelta(t), 0);

    const linkedCardIds = new Set(
      this.creditCards()
        .filter((card) => card.paymentAccountId === accountId)
        .map((card) => card.id),
    );

    const cardDelta = this.allTransactions()
      .filter((t) => t.creditCardId !== null && linkedCardIds.has(t.creditCardId) && t.status === 'Paid')
      .filter((t) => new Date(t.paidDate ?? t.date).getTime() <= cutoffMs)
      .reduce((sum, t) => sum + this.accountDelta(t), 0);

    return ownDelta + cardDelta;
  }

  // Saldo REAL acumulado no fechamento de cada mês passado (quanto a conta tinha ao
  // FINAL daquele mês) — não o fluxo isolado do mês, que reiniciaria do zero e ignoraria
  // o saldo que já vinha acumulado. Só lista meses que já fecharam de verdade (o mês
  // corrente ainda está em andamento, seu "saldo final" não existe ainda — esse já
  // aparece acima, em Previsão de Saldo/Saldo Atual) e que já têm alguma transação real.
  readonly historicalBalances = computed(() => {
    const accountId = this.activeAccountId();
    const account = this.accounts().find((a) => a.id === accountId);
    const earliestMs = this.earliestActiveAccountDateMs();

    if (!account || accountId === null || earliestMs === null) {
      return [];
    }

    const year = this.selectedYear();
    const nowMs = this.today.getTime();
    const rows: { id: string; label: string; closingBalance: number }[] = [];

    for (let month = 1; month <= 12; month++) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthEndMs = Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999);

      if (monthEndMs < earliestMs || monthEndMs >= nowMs) {
        continue;
      }

      // "julho/2026" — o CSS "capitalize" no template deixa "Julho/2026" visualmente,
      // mesmo estilo do seletor de mês na barra de navegação (ver MonthSelectionService).
      const monthName = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });

      rows.push({
        id: `${year}-${month}`,
        label: `${monthName}/${year}`,
        closingBalance: account.balance + this.paidCumulativeDeltaUpTo(accountId, monthEndMs),
      });
    }

    return rows;
  });

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

  // Mês inteiramente no passado (não é nem o atual) — usado só pra decidir o sentido
  // padrão da ordenação da Linha do Tempo (ver efeito no construtor): olhando pra trás,
  // o dia mais recente (maior) é o que importa primeiro; olhando pro mês atual, o que
  // importa é o que vem a partir de hoje em diante.
  private readonly monthIsPast = computed(() => {
    const todayKey = this.today.getFullYear() * 12 + (this.today.getMonth() + 1);
    const selectedKey = this.selectedYear() * 12 + this.selectedMonth();
    return selectedKey < todayKey;
  });

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

  // "agosto/2026" -> "Agosto/2026" — mesmo padrão de capitalização já usado em
  // credit-card-invoice.ts, aparece como título de card, não no meio de uma frase.
  readonly selectedMonthLabelCapitalized = computed(() => {
    const label = this.monthSelection.selectedMonthLabel();
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  // Chave que o checkbox de cada linha do modal de dívidas usa — por CARTÃO inteiro (a
  // seção "Cartões" só mostra o total agregado, sem quebra por série) ou por SÉRIE
  // (recurrenceGroupId, ou o próprio id se for avulsa) dentro de cada categoria.
  private debtKeyFor(t: { creditCardId: string | null; recurrenceGroupId: string | null; id: string }): string {
    return t.creditCardId ? `card:${t.creditCardId}` : `group:${t.recurrenceGroupId ?? t.id}`;
  }

  private monthKeyOfIso(iso: string): number {
    const d = new Date(iso);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  }

  private static readonly EXCLUDED_DEBT_KEYS_STORAGE_KEY = 'true-balance:dashboard:excludedDebtKeys';

  // Persistido em localStorage (não no backend) de propósito: é só uma preferência de
  // EXIBIÇÃO — "não conta esse empréstimo específico na minha meta de quitar tudo agora"
  // — não é um dado financeiro real que precise sincronizar entre dispositivos.
  private loadExcludedDebtKeys(): ReadonlySet<string> {
    try {
      const raw = localStorage.getItem(Dashboard.EXCLUDED_DEBT_KEYS_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  private readonly excludedDebtKeys = signal<ReadonlySet<string>>(this.loadExcludedDebtKeys());

  // "Se eu pegasse X reais hoje, quitava tudo que devo" — soma tudo que ainda tá Pendente
  // (qualquer conta ou cartão), menos o que é FIXA de propósito (assinatura mensal não é
  // uma dívida que se "quita" de uma vez, sempre vai existir uma próxima cobrança) e menos
  // o que o próprio usuário desmarcou no modal de detalhamento (ex: um empréstimo sem
  // juros que ele não pretende quitar de uma vez só, mesmo podendo).
  //
  // No mês CORRENTE, é literalmente "hoje": todo Pendente conta, mesmo atrasado. Navegando
  // pra outro mês, o texto e o valor mudam de figura — "quanto eu ainda vou dever EM
  // {mês}" — assumindo que tudo com vencimento ANTES do mês navegado já foi pago em dia
  // (ver isCurrentMonth acima). Estorno pendente reduz o total, mesma convenção de sempre.
  readonly totalDebtToday = computed(() => {
    const isCurrent = this.isCurrentMonth();
    const selectedMonthKey = this.selectedYear() * 12 + (this.selectedMonth() - 1);
    const excluded = this.excludedDebtKeys();

    return this.allTransactions()
      .filter((t) => t.type !== 'Transfer' && t.status === 'Pending' && !t.isFixed)
      .filter((t) => isCurrent || this.monthKeyOfIso(t.date) >= selectedMonthKey)
      .filter((t) => !excluded.has(this.debtKeyFor(t)))
      .reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0);
  });

  readonly debtCardTitle = computed(() =>
    this.isCurrentMonth()
      ? 'Quanto preciso pra quitar todas as minhas dívidas hoje?'
      : `Quanto preciso pra quitar em ${this.selectedMonthLabelCapitalized()}?`,
  );

  // Quanto de despesa FIXA (assinaturas, mensalidades) cai no mês navegado — independe de
  // já ter sido paga ou não (é sobre "quanto isso me custa por mês", não "quanto ainda
  // falta pagar"), mesma convenção do resto do Resumo do Mês (soma tudo do mês, sem
  // filtrar por status).
  readonly monthlyFixedExpenseTotal = computed(() => {
    const year = this.selectedYear();
    const month = this.selectedMonth();

    return this.allTransactions()
      .filter((t) => t.type === 'Expense' && t.isFixed)
      .filter((t) => {
        const d = new Date(t.date);
        return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  });

  readonly daySortDirection = signal<'asc' | 'desc'>('asc');

  // No mês atual, os dias já passados deste mesmo mês raramente importam (já aconteceram
  // e não mudam mais) — ficam escondidos por padrão, só o "hoje" em diante aparece de
  // cara. "Ver dias anteriores" revela de volta, "Esconder" some com eles de novo. Em
  // qualquer outro mês (passado ou futuro) não existe "dia anterior irrelevante" — todos
  // aparecem sempre.
  readonly showPastDaysOfCurrentMonth = signal(false);

  constructor() {
    // Muda o sentido padrão da ordenação sozinho conforme o mês muda: olhando pra trás
    // (mês passado), o dia mais recente vem primeiro; no mês atual, a ordem cronológica
    // a partir de hoje faz mais sentido. Só reresseta quando o MÊS muda (não a cada
    // render) — o usuário ainda pode alternar manualmente clicando no cabeçalho "Dia"
    // sem que isso volte atrás sozinho enquanto ele continuar no mesmo mês.
    effect(() => {
      this.daySortDirection.set(this.monthIsPast() ? 'desc' : 'asc');
      this.showPastDaysOfCurrentMonth.set(false);
    });
  }

  toggleDaySort(): void {
    this.daySortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
  }

  togglePastDaysOfCurrentMonth(): void {
    this.showPastDaysOfCurrentMonth.update((expanded) => !expanded);
  }

  isToday(date: Date): boolean {
    return (
      date.getFullYear() === this.today.getFullYear() &&
      date.getMonth() === this.today.getMonth() &&
      date.getDate() === this.today.getDate()
    );
  }

  trackTimelineRow(row: DailyTimelineRow): string {
    switch (row.kind) {
      case 'day':
        return `day:${row.day.date.getTime()}`;
      case 'range':
        return `range:${row.startDate.getTime()}`;
      case 'pastToggle':
        return 'pastToggle';
    }
  }

  // Reaproveitado pelos três detalhamentos "i" do Dashboard (Linha do Tempo, dívidas
  // pendentes, despesa fixa) — date é opcional porque só o da Linha do Tempo já é de um
  // dia só (o cabeçalho mostra a data); os outros dois cruzam vários meses, cada item
  // mostra a própria data (ver CashFlowDetailItem.date).
  readonly detailModal = signal<{ label: string; date: Date | null; items: CashFlowDetailItem[]; total: number } | null>(
    null,
  );

  openDayDetail(day: DayCashFlow, kind: 'income' | 'expense'): void {
    this.detailModal.set({
      label: kind === 'income' ? 'Receitas' : 'Despesas',
      date: day.date,
      items: kind === 'income' ? day.incomeDetails : day.expenseDetails,
      total: kind === 'income' ? day.totalIncome : day.totalExpense,
    });
  }

  // Detalhamento das dívidas em duas camadas — de outro jeito (uma linha por ocorrência)
  // uma parcelada em 10x vira 10 linhas, e a lista fica enorme e ilegível (ver histórico
  // desta conversa). Uma seção "Cartões" só com o total agregado de cada cartão (sem
  // quebra por série — esse detalhe já existe na aba Cartões, aqui só atrapalharia); as
  // demais seções são as CATEGORIAS de verdade das dívidas sem cartão (ex: "Dívidas", se
  // for a categoria real do empréstimo) — dentro delas sim, quebrado por série
  // (recurrenceGroupId: as parcelas restantes de uma mesma compra viram uma linha só).
  readonly debtDetailModal = signal<{ sections: DebtSection[] } | null>(null);
  private readonly expandedDebtSections = signal<ReadonlySet<string>>(new Set(['cards']));
  // Rascunho local dos checkboxes — só é aplicado de verdade (afeta o card do Dashboard)
  // ao clicar Salvar; fechar sem salvar descarta (ver closeDebtDetail).
  private readonly draftExcludedDebtKeys = signal<ReadonlySet<string>>(new Set());

  isDebtSectionExpanded(key: string): boolean {
    return this.expandedDebtSections().has(key);
  }

  toggleDebtSection(key: string): void {
    this.expandedDebtSections.update((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  isDebtLeafChecked(key: string): boolean {
    return !this.draftExcludedDebtKeys().has(key);
  }

  toggleDebtLeaf(key: string): void {
    this.draftExcludedDebtKeys.update((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  // Total ao vivo de uma seção, considerando só os leaves ainda marcados no rascunho —
  // método comum (não computed()) de propósito, igual outros lugares desta sessão que
  // precisam reagir a mutação de signal em vez de só a troca do array inteiro.
  debtSectionTotal(section: DebtSection): number {
    const excluded = this.draftExcludedDebtKeys();
    return section.leaves.filter((leaf) => !excluded.has(leaf.key)).reduce((sum, leaf) => sum + leaf.total, 0);
  }

  debtDetailGrandTotal(): number {
    const excluded = this.draftExcludedDebtKeys();
    return (this.debtDetailModal()?.sections ?? [])
      .flatMap((section) => section.leaves)
      .filter((leaf) => !excluded.has(leaf.key))
      .reduce((sum, leaf) => sum + leaf.total, 0);
  }

  openDebtDetail(): void {
    const isCurrent = this.isCurrentMonth();
    const selectedMonthKey = this.selectedYear() * 12 + (this.selectedMonth() - 1);

    const items = this.allTransactions()
      .filter((t) => t.type !== 'Transfer' && t.status === 'Pending' && !t.isFixed)
      .filter((t) => isCurrent || this.monthKeyOfIso(t.date) >= selectedMonthKey);

    const cardById = new Map(this.creditCards().map((c) => [c.id, c]));
    const categoryById = new Map(this.categories().map((c) => [c.id, c]));

    const cardTotals = new Map<string, number>();
    const categorySections = new Map<string, { label: string; leaves: Map<string, DebtLeaf> }>();

    for (const t of items) {
      const signedAmount = t.type === 'Income' ? -t.amount : t.amount;

      if (t.creditCardId) {
        cardTotals.set(t.creditCardId, (cardTotals.get(t.creditCardId) ?? 0) + signedAmount);
        continue;
      }

      const section = categorySections.get(t.categoryId) ?? {
        label: categoryById.get(t.categoryId)?.name ?? 'Outras dívidas',
        leaves: new Map<string, DebtLeaf>(),
      };
      const leafKey = this.debtKeyFor(t);
      const existingLeaf = section.leaves.get(leafKey);

      if (existingLeaf) {
        existingLeaf.count += 1;
        existingLeaf.total += signedAmount;
      } else {
        section.leaves.set(leafKey, { key: leafKey, description: t.description, count: 1, total: signedAmount });
      }

      categorySections.set(t.categoryId, section);
    }

    const sections: DebtSection[] = [];

    if (cardTotals.size > 0) {
      const leaves = [...cardTotals.entries()]
        .map(([cardId, total]) => ({
          key: `card:${cardId}`,
          description: cardById.get(cardId)?.name ?? 'Cartão',
          count: 1,
          total,
        }))
        .sort((a, b) => b.total - a.total);

      sections.push({
        key: 'cards',
        label: 'Cartões',
        total: leaves.reduce((sum, leaf) => sum + leaf.total, 0),
        leaves,
      });
    }

    for (const section of categorySections.values()) {
      const leaves = [...section.leaves.values()].sort((a, b) => b.total - a.total);
      sections.push({
        key: `category:${section.label}`,
        label: section.label,
        total: leaves.reduce((sum, leaf) => sum + leaf.total, 0),
        leaves,
      });
    }

    sections.sort((a, b) => b.total - a.total);

    this.expandedDebtSections.set(new Set(['cards']));
    this.draftExcludedDebtKeys.set(this.excludedDebtKeys());
    this.debtDetailModal.set({ sections });
  }

  saveDebtExclusions(): void {
    const keys = this.draftExcludedDebtKeys();
    this.excludedDebtKeys.set(keys);

    try {
      localStorage.setItem(Dashboard.EXCLUDED_DEBT_KEYS_STORAGE_KEY, JSON.stringify([...keys]));
    } catch {
      // Sem storage disponível (ex: modo privado) — a seleção só não sobrevive a um
      // reload, mas continua valendo pelo resto desta sessão (já foi pro signal acima).
    }

    this.debtDetailModal.set(null);
  }

  closeDebtDetail(): void {
    this.debtDetailModal.set(null);
  }

  // Mesma filtragem de monthlyFixedExpenseTotal(), item por item.
  openFixedExpenseDetail(): void {
    const year = this.selectedYear();
    const month = this.selectedMonth();

    const items = this.allTransactions()
      .filter((t) => t.type === 'Expense' && t.isFixed)
      .filter((t) => {
        const d = new Date(t.date);
        return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({ description: t.description, amount: t.amount, date: t.date }));

    this.detailModal.set({
      label: `Despesa fixa — ${this.selectedMonthLabelCapitalized()}`,
      date: null,
      items,
      total: this.monthlyFixedExpenseTotal(),
    });
  }

  closeDetailModal(): void {
    this.detailModal.set(null);
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

  // Agrupa uma sequência (já em ordem cronológica) de dias FUTUROS em linhas — dias com
  // movimento (receita ou despesa) viram uma linha normal; sequências de 2+ dias
  // CONSECUTIVOS sem nenhum movimento viram uma única linha "de X a Y" (ver
  // DailyTimelineRow). Um dia isolado sem movimento (cercado por dias com movimento) não
  // vira faixa sozinho — só aparece como dia normal com Receitas/Despesas R$ 0,00, senão
  // ficaria uma faixa de 1 dia só ("21 a 21"), que não ajuda em nada. Recalculado do zero
  // toda vez a partir dos dados atuais — não guarda nenhum estado, então uma transação
  // nova lançada no meio de uma faixa já existente naturalmente quebra ela em pedaços na
  // próxima leitura, sem precisar de nenhuma lógica extra de "recalcular faixa".
  private compactZeroMovementRuns(days: DayCashFlow[]): DailyTimelineRow[] {
    const rows: DailyTimelineRow[] = [];
    let i = 0;

    while (i < days.length) {
      const isZeroMovement = (day: DayCashFlow) => day.totalIncome === 0 && day.totalExpense === 0;

      if (!isZeroMovement(days[i])) {
        rows.push({ kind: 'day', day: days[i] });
        i++;
        continue;
      }

      let j = i;
      while (j < days.length && isZeroMovement(days[j])) {
        j++;
      }

      if (j - i >= 2) {
        rows.push({ kind: 'range', startDate: days[i].date, endDate: days[j - 1].date, dailyBalance: days[j - 1].dailyBalance });
      } else {
        rows.push({ kind: 'day', day: days[i] });
      }

      i = j;
    }

    return rows;
  }

  // Monta as linhas em ordem cronológica (ascendente) — a ordenação asc/desc escolhida
  // pelo usuário (ver daySortDirection) só é aplicada NO FINAL, invertendo a lista
  // inteira já pronta (ver dailyTimelineRows), pra não complicar a lógica de "qual dia é
  // hoje"/"qual é o último do mês" com dois sentidos possíveis.
  private readonly ascendingTimelineRows = computed<DailyTimelineRow[] | undefined>(() => {
    const days = this.unsortedDailyCashFlow();

    if (days === undefined) {
      return undefined;
    }

    // Fora do mês atual não existe "passado irrelevante" nem "futuro ainda não
    // acontecido" — é tudo passado (mês anterior) ou tudo projeção (mês seguinte em
    // diante), então mostra a lista inteira, um dia por linha, sem esconder nada.
    if (!this.isCurrentMonth()) {
      return days.map((day) => ({ kind: 'day', day }));
    }

    const todayIndex = this.today.getDate() - 1;
    const lastIndex = days.length - 1;
    const rows: DailyTimelineRow[] = [];
    const pastExpanded = this.showPastDaysOfCurrentMonth();

    if (todayIndex > 0) {
      rows.push({ kind: 'pastToggle', expanded: pastExpanded, count: todayIndex });
    }

    if (pastExpanded) {
      for (let i = 0; i < todayIndex; i++) {
        rows.push({ kind: 'day', day: days[i] });
      }
    }

    rows.push({ kind: 'day', day: days[todayIndex] });

    if (todayIndex < lastIndex) {
      // Dias estritamente entre hoje e o último dia do mês — sempre visíveis (sem
      // esconder/expandir), só os que não têm NENHUM movimento colapsam numa faixa (ver
      // compactZeroMovementRuns). O último dia em si é sempre mostrado à parte logo
      // abaixo, nunca dobrado numa faixa.
      const futureMiddle = days.slice(todayIndex + 1, lastIndex);
      rows.push(...this.compactZeroMovementRuns(futureMiddle));
      rows.push({ kind: 'day', day: days[lastIndex] });
    }

    return rows;
  });

  readonly dailyTimelineRows = computed<DailyTimelineRow[] | undefined>(() => {
    const rows = this.ascendingTimelineRows();

    if (rows === undefined) {
      return undefined;
    }

    return this.daySortDirection() === 'desc' ? [...rows].reverse() : rows;
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

  // As linhas "Entradas"/"Saídas" de cada card de Saldo Atual abrem este modal com a
  // mesma lista expansível por categoria que antes ficava sempre visível na seção
  // "Resumo do Mês" (removida — duplicava as mesmas entradas/saídas já mostradas aqui).
  readonly summaryDetailModal = signal<'Income' | 'Expense' | null>(null);

  readonly summaryDetailList = computed(() => {
    const type = this.summaryDetailModal();
    return type === 'Income' ? this.incomeSummary() : type === 'Expense' ? this.expenseSummary() : undefined;
  });

  // Cada card de conta mostra a própria Entradas/Saídas, então clicar numa linha precisa
  // primeiro tornar AQUELA conta a ativa (incomeSummary/expenseSummary só calculam pra
  // activeAccountId) — senão o modal abriria com o detalhe de outra conta.
  openAccountSummaryDetail(accountId: string, type: 'Income' | 'Expense'): void {
    this.selectAccount(accountId);
    this.summaryDetailModal.set(type);
  }

  closeSummaryDetail(): void {
    this.summaryDetailModal.set(null);
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
  private readonly creditCardSummaryRow = computed<MonthSummaryRow | null>(() => {
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
  });

  // Duas colunas lado a lado (Receitas / Despesas) em vez de uma lista só — mais fácil
  // de comparar os dois de relance, sem misturar tipos diferentes na mesma coluna.
  readonly incomeSummary = computed(() => this.monthSummary()?.filter((row) => row.type === 'Income'));
  readonly expenseSummary = computed(() => this.monthSummary()?.filter((row) => row.type === 'Expense'));

  // Detalhamento pago/pendente do total de cada coluna do Resumo do Mês (Sprint 3) —
  // calculado direto das transações (não a partir das linhas já agrupadas por categoria)
  // porque MonthSummaryRow só guarda o total, sem quebra por status. Cartão entra aqui
  // reaproveitando creditCardSummaryRow() (a mesma linha sintética "Cartões" que já
  // aparece no Resumo do Mês) — sem isso, pago+pendente não bateria com o total exibido
  // quando a conta tiver cartão vinculado.
  private statusTotalFor(type: 'Income' | 'Expense'): { total: number; paid: number; pending: number } {
    let paid = 0;
    let pending = 0;

    for (const transaction of this.accountTransactions() ?? []) {
      if (transaction.type !== type) {
        continue;
      }

      if (transaction.status === 'Paid') {
        paid += transaction.amount;
      } else {
        pending += transaction.amount;
      }
    }

    const cardRow = this.creditCardSummaryRow();

    if (cardRow && cardRow.type === type) {
      for (const sub of cardRow.subcategories) {
        // paymentTiming só é preenchido quando a fatura inteira já foi paga (ver
        // creditCardSummaryRow) — serve aqui só como "está paga?", o valor em si não
        // interessa.
        if (sub.paymentTiming !== null) {
          paid += sub.total;
        } else {
          pending += sub.total;
        }
      }
    }

    return { total: paid + pending, paid, pending };
  }

  readonly incomeStatusTotal = computed(() => this.statusTotalFor('Income'));
  readonly expenseStatusTotal = computed(() => this.statusTotalFor('Expense'));

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
