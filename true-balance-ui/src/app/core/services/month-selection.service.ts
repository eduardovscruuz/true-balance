import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { TransactionService } from './transaction.service';

// Espelha a janela real garantida pelo backend: ProjectionService só projeta despesas
// fixas/parceladas até 24 meses à frente.
const FUTURE_WINDOW_MONTHS = 24;

// Estado do mês selecionado é GLOBAL — um único seletor na barra de navegação (não um
// por tela). Dashboard, Transações do Mês e qualquer tela futura que precise de
// contexto de mês só leem os signals daqui; nenhuma delas tem o próprio estado de mês.
@Injectable({ providedIn: 'root' })
export class MonthSelectionService {
  private readonly transactionService = inject(TransactionService);

  // Qualquer dia dentro do mês selecionado — só year/month importam, o "dia" é descartado.
  private readonly today = new Date();
  private readonly selectedDate = signal(this.today);

  private readonly todayKey = this.toMonthKey(this.today.getFullYear(), this.today.getMonth() + 1);
  private readonly maxMonthKey = this.todayKey + FUTURE_WINDOW_MONTHS;

  readonly selectedYear = computed(() => this.selectedDate().getFullYear());
  readonly selectedMonth = computed(() => this.selectedDate().getMonth() + 1);

  private readonly selectedMonthKey = computed(() => this.toMonthKey(this.selectedYear(), this.selectedMonth()));

  readonly selectedMonthLabel = computed(() =>
    this.selectedDate().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );

  // Limite de "mês anterior" é a transação mais antiga real (entre todas as contas),
  // não uma janela arbitrária — não existe "mês anterior" pra mostrar antes disso.
  private readonly earliestTransactionDateIso = toSignal(this.transactionService.getEarliestDate(), {
    initialValue: null,
  });

  private readonly earliestMonthKey = computed(() => {
    const iso = this.earliestTransactionDateIso();

    if (!iso) {
      return null;
    }

    const date = new Date(iso);
    return this.toMonthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
  });

  readonly canGoPrevious = computed(() => {
    const earliest = this.earliestMonthKey();
    return earliest !== null && this.selectedMonthKey() > earliest;
  });

  readonly canGoNext = computed(() => this.selectedMonthKey() < this.maxMonthKey);

  previousMonth(): void {
    if (!this.canGoPrevious()) {
      return;
    }

    const current = this.selectedDate();
    this.selectedDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextMonth(): void {
    if (!this.canGoNext()) {
      return;
    }

    const current = this.selectedDate();
    this.selectedDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  private toMonthKey(year: number, month: number): number {
    return year * 12 + month;
  }
}
