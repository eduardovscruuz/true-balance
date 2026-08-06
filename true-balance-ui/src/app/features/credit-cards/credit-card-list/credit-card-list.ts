import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { CreditCardFormModal } from '../credit-card-form-modal/credit-card-form-modal';
import { CreditCard } from '../../../core/models/credit-card.model';
import { Transaction } from '../../../core/models/transaction.model';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { MonthSelectionService } from '../../../core/services/month-selection.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { computeCreditCardInvoice, creditCardClosingDateFromDueDate } from '../../../shared/utils/credit-card-invoice.util';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';

// Estado de UM bucket de fatura (todas as transações cujo vencimento cai no mesmo mês) —
// usado tanto pro ciclo já fechado quanto pro ainda aberto, e agora também pra fatura do
// mês navegado no seletor global (ver summarizeCard).
interface InvoiceBucket {
  dueDate: Date;
  total: number;
  // Igual credit-card-invoice.ts: quanto já é gasto de VERDADE hoje — fixa só entra
  // quando o dia dela (a data real daquela cobrança) já chegou. "total" acima é o valor
  // final previsto, com tudo incluso.
  confirmedTotal: number;
  hasItems: boolean;
  status: 'Pending' | 'Paid' | null;
  paidDate: string | null;
}

// A fatura "aberta" é sempre UMA só — a que fecharia hoje se uma compra fosse feita
// agora. Qualquer mês depois dela ainda nem começou a acumular ("future" — nenhuma
// compra cai ali ainda, é só previsão pura). Qualquer mês antes dela já fechou
// ("closed" — paga, pendente ou zerada, ver invoiceStatusLabel).
export type CreditCardCycleState = 'future' | 'open' | 'closed';

export interface CreditCardSummary {
  card: CreditCard;
  usedLimit: number;
  cycleState: CreditCardCycleState;
  currentDueDate: Date;
  currentClosingDate: Date;
  currentTotal: number;
  currentConfirmedTotal: number;
  currentStatus: 'Pending' | 'Paid' | null;
  paidEarly: boolean;
  upcomingTotal: number;
}

@Component({
  selector: 'app-credit-card-list',
  imports: [RouterLink, CurrencyPipe, DatePipe, LucideAngularModule, CreditCardFormModal],
  templateUrl: './credit-card-list.html',
  styleUrl: './credit-card-list.scss',
})
export class CreditCardList {
  private readonly creditCardService = inject(CreditCardService);
  private readonly transactionService = inject(TransactionService);
  // Mês selecionado é global (seletor único na barra de navegação) — a "fatura atual" de
  // cada card acompanha ele, igual credit-card-invoice.ts já faz.
  private readonly monthSelection = inject(MonthSelectionService);

  private readonly refreshTrigger = signal(0);

  // Cartões cadastrados antes do campo existir não têm cor/ícone — cai num cinza neutro.
  readonly resolveIconName = (icon: string | null) => resolveLucideIconName(icon ?? '');
  readonly cardColor = (color: string | null) => color ?? '#9CA3AF';

  private readonly creditCards = toSignal(
    toObservable(this.refreshTrigger).pipe(switchMap(() => this.creditCardService.getAll())),
    { initialValue: [] as CreditCard[] },
  );

  private readonly allTransactions = toSignal(
    toObservable(this.refreshTrigger).pipe(switchMap(() => this.transactionService.getAll())),
    { initialValue: [] as Transaction[] },
  );

  // Um resumo por cartão — limite usado, fatura atual (aberta/fechada, paga ou não) e
  // total das próximas. Tudo calculado no cliente a partir da lista completa de
  // transações (mesmo padrão já usado no Dashboard/AI) — a escala do app não justifica
  // um endpoint dedicado só pra isso ainda.
  readonly creditCardSummaries = computed<CreditCardSummary[]>(() => {
    const cards = this.creditCards();
    const transactions = this.allTransactions();
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    const selectedYear = this.monthSelection.selectedYear();
    const selectedMonth = this.monthSelection.selectedMonth();

    return cards.map((card) =>
      this.summarizeCard(card, transactions, selectedYear, selectedMonth, todayYear, todayMonth, todayDay),
    );
  });

  private summarizeCard(
    card: CreditCard,
    allTransactions: Transaction[],
    selectedYear: number,
    selectedMonth: number,
    todayYear: number,
    todayMonth: number,
    todayDay: number,
  ): CreditCardSummary {
    const cardTransactions = allTransactions.filter((t) => t.creditCardId === card.id);
    const todayUtcMidnight = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay));

    const bucketAt = (year: number, month: number): InvoiceBucket => {
      const items = cardTransactions.filter((t) => {
        const d = new Date(t.date);
        return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
      });

      const total = items.reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0);
      // Igual credit-card-invoice.ts: fixa só conta se o DIA de verdade daquela cobrança
      // específica já chegou — comparado com hoje de verdade, não com o mês navegado.
      const confirmedTotal = items.reduce((sum, t) => {
        if (t.isFixed && new Date(t.purchaseDate ?? t.date) > todayUtcMidnight) {
          return sum;
        }
        return sum + (t.type === 'Income' ? -t.amount : t.amount);
      }, 0);
      const hasItems = items.length > 0;
      const status: 'Pending' | 'Paid' | null = !hasItems
        ? null
        : items.every((t) => t.status === 'Paid')
          ? 'Paid'
          : 'Pending';
      const paidDate = items.find((t) => t.paidDate)?.paidDate ?? null;
      const daysInMonth = new Date(year, month, 0).getDate();
      const dueDate = new Date(Date.UTC(year, month - 1, Math.min(card.dueDay, daysInMonth)));

      return { dueDate, total, confirmedTotal, hasItems, status, paidDate };
    };

    // "Fatura atual" é literalmente a do mês selecionado no seletor global — igual
    // credit-card-invoice.ts já faz, sem heurística de "qual seria mais relevante": o
    // usuário navega, o card mostra exatamente aquele mês.
    const current = bucketAt(selectedYear, selectedMonth);
    const currentClosingDate = creditCardClosingDateFromDueDate(selectedYear, selectedMonth, card.closingDay, card.dueDay);

    // A ÚNICA fatura "aberta" é a que fecharia HOJE se uma compra fosse feita agora — daí
    // comparamos o mês selecionado com o mês dessa fatura real (não com a data de
    // fechamento isolada, que sozinha não distingue "aberta" de "futura": ambas ainda não
    // fecharam).
    const realOpenDueDate = computeCreditCardInvoice(todayYear, todayMonth, todayDay, card.closingDay, card.dueDay, 0).dueDate;
    const realOpenMonthKey = realOpenDueDate.getUTCFullYear() * 12 + realOpenDueDate.getUTCMonth();
    const selectedMonthKeyForCycle = selectedYear * 12 + (selectedMonth - 1);
    const cycleState: CreditCardCycleState =
      selectedMonthKeyForCycle > realOpenMonthKey ? 'future' : selectedMonthKeyForCycle === realOpenMonthKey ? 'open' : 'closed';

    const paidEarly =
      current.status === 'Paid' && current.paidDate !== null && new Date(current.paidDate) < current.dueDate;

    const monthKeyOf = (t: Transaction) => {
      const d = new Date(t.date);
      return d.getUTCFullYear() * 12 + d.getUTCMonth();
    };

    // "Quanto do limite já tá em uso" é uma pergunta sobre HOJE, sempre — não muda com o
    // mês que se está navegando na tela. Mesma regra EXATA do confirmedTotal acima (dia a
    // dia, não por mês): compra avulsa ou parcelada conta inteira desde já (a dívida foi
    // assumida no ato da compra); fixa só conta se o dia de verdade daquela cobrança
    // específica já chegou. Precisa ser a mesma regra — eram duas contas divergentes antes
    // (uma por mês, outra por dia) e isso causava inconsistência entre "Limite usado" e o
    // valor mostrado como "Fatura atual" pro mesmo cartão.
    const usedLimit = cardTransactions
      .filter((t) => t.status === 'Pending')
      .filter((t) => !t.isFixed || new Date(t.purchaseDate ?? t.date) <= todayUtcMidnight)
      .reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0);

    // Tudo que ainda tá pendente e vence DEPOIS da fatura mostrada acima (a do mês
    // navegado) — exclui fixa pelo mesmo motivo do limite usado: a projeção da
    // academia/assinatura pros próximos meses não é uma dívida real ainda. Só entra aqui
    // o que já é compromisso assumido (avulsa/parcelada).
    const upcomingTotal = cardTransactions
      .filter((t) => t.status === 'Pending')
      .filter((t) => monthKeyOf(t) > selectedMonthKeyForCycle)
      .filter((t) => !t.isFixed)
      .reduce((sum, t) => sum + (t.type === 'Income' ? -t.amount : t.amount), 0);

    return {
      card,
      usedLimit,
      cycleState,
      currentDueDate: current.dueDate,
      currentClosingDate,
      currentTotal: current.total,
      currentConfirmedTotal: current.confirmedTotal,
      currentStatus: current.status,
      paidEarly,
      upcomingTotal,
    };
  }

  invoiceStatusLabel(summary: CreditCardSummary): string {
    // Futura: mês ainda nem começou a acumular — nenhuma compra cai ali de verdade
    // ainda, é só a projeção do sistema (ver template: só mostra a previsão final).
    if (summary.cycleState === 'future') {
      return 'Futura';
    }

    // Fechada sem nada pra pagar (zero itens, ou itens que se cancelaram — ex: compra +
    // estorno do mesmo valor) não é "Fechada" nem "Paga" de verdade — não tem ação
    // nenhuma esperando o usuário. Só se aplica depois de fechada: enquanto aberta, ainda
    // pode receber novas compras, então continua "Aberta" mesmo estando em zero por ora.
    if (summary.cycleState === 'closed' && summary.currentTotal === 0) {
      return 'Zerada';
    }

    if (!summary.currentStatus) {
      return summary.cycleState === 'open' ? 'Aberta' : 'Fechada';
    }

    if (summary.currentStatus === 'Paid') {
      return summary.paidEarly ? 'Paga adiantada' : 'Paga';
    }

    return summary.cycleState === 'open' ? 'Aberta' : 'Fechada — pendente';
  }

  invoiceStatusBadgeClass(summary: CreditCardSummary): string {
    if (summary.cycleState === 'future' || (summary.cycleState === 'closed' && summary.currentTotal === 0)) {
      return 'bg-gray-50 text-gray-500 border-gray-200';
    }

    if (summary.currentStatus === 'Paid') {
      return 'bg-green-50 text-green-700 border-green-200';
    }

    if (summary.cycleState === 'closed' && summary.currentStatus === 'Pending') {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }

    return 'bg-blue-50 text-blue-700 border-blue-200';
  }

  // Limite sem valor cadastrado (0) não tem "porcentagem usada" fazendo sentido — trava
  // em 0 pra não dividir por zero. Acima de 100% (estourou o limite) trava a barra em
  // 100%, mas o texto continua mostrando o valor real usado.
  usedLimitPercent(summary: CreditCardSummary): number {
    if (summary.card.limit <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (summary.usedLimit / summary.card.limit) * 100));
  }

  // Negativo quando o usado passa do limite cadastrado (estourou) — mostrado em vermelho
  // no template pra ficar claro que é uma situação anormal, não só "pouco disponível".
  availableLimit(summary: CreditCardSummary): number {
    return summary.card.limit - summary.usedLimit;
  }

  // Qual cartão tem o menu de "..." (Editar/Excluir) aberto — só um por vez.
  readonly openMenuCardId = signal<string | null>(null);

  toggleCardMenu(cardId: string): void {
    this.openMenuCardId.update((current) => (current === cardId ? null : cardId));
  }

  closeCardMenu(): void {
    this.openMenuCardId.set(null);
  }

  readonly modalRequest = signal<{ creditCardId: string | null } | null>(null);

  openNewModal(): void {
    this.modalRequest.set({ creditCardId: null });
  }

  openEditModal(creditCardId: string): void {
    this.modalRequest.set({ creditCardId });
  }

  onModalClosed(): void {
    this.modalRequest.set(null);
  }

  onModalSaved(): void {
    this.refreshTrigger.update((n) => n + 1);
  }

  deleteCreditCard(id: string, name: string): void {
    if (!confirm(`Excluir o cartão "${name}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    this.creditCardService.delete(id).subscribe({
      next: () => this.refreshTrigger.update((n) => n + 1),
      error: () => alert('Não foi possível excluir. Esse cartão provavelmente tem transações vinculadas.'),
    });
  }
}
