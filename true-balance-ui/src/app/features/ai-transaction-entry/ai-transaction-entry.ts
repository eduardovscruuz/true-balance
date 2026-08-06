import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

import { CurrencyMaskDirective } from '../../shared/directives/currency-mask.directive';
import { InitialsPipe } from '../../shared/pipes/initials.pipe';
import { resolveLucideIconName } from '../../shared/utils/lucide-icon.util';
import { STATUS_BADGE_CLASS } from '../../shared/utils/payment-status.util';
import { AccountService } from '../../core/services/account.service';
import { AiService } from '../../core/services/ai.service';
import { CategoryService } from '../../core/services/category.service';
import { TransactionService } from '../../core/services/transaction.service';
import { TransactionType } from '../../core/models/transaction.model';

// Uma proposta editável na tela de revisão — igual um CreateTransaction, mas achatada
// pros campos que fazem sentido editar aqui (conta e categoria a IA nunca sabe de
// verdade, então sempre chegam pra confirmar; os demais campos avançados — fixa,
// parcelado, cartão — não fazem sentido nesse fluxo rápido, ficam sempre nulos/false).
interface ProposalRow {
  localId: string;
  type: TransactionType;
  description: string;
  amount: number;
  date: string;
  categoryId: string;
  accountId: string;
  // Quando a IA acha que esse texto confirma uma transação PENDENTE já cadastrada (ex:
  // "recebi os mil reais do Laboclin"). matchedPendingTransactionId só existe como
  // SUGESTÃO — nunca aplicada sozinha; linkToMatch é a decisão explícita do usuário de
  // aceitar o vínculo (marca a pendência como paga) ou não (cria uma transação nova).
  matchedPendingTransactionId: string | null;
  matchedPendingLabel: string | null;
  // Valor que já estava previsto na pendência — comparado com o "amount" (o que
  // realmente aconteceu, segundo a IA) pra mostrar a diferença na revisão.
  matchedPendingAmount: number | null;
  linkToMatch: boolean;
  // Cada linha começa só em modo leitura (texto simples, igual a tabela de Transações do
  // Mês) — vira formulário editável só quando o usuário clica no lápis.
  isEditing: boolean;
}

@Component({
  selector: 'app-ai-transaction-entry',
  imports: [FormsModule, CurrencyMaskDirective, LucideAngularModule, InitialsPipe, NgTemplateOutlet, CurrencyPipe],
  templateUrl: './ai-transaction-entry.html',
})
export class AiTransactionEntry {
  readonly resolveIconName = resolveLucideIconName;
  readonly statusBadgeClass = STATUS_BADGE_CLASS;
  // Mesmas cores do badge padrão (statusBadgeClass), mas sem a largura fixa (w-36) do
  // componente original — aqui os dois badges (antes/depois) ficam lado a lado na mesma
  // célula, então cada um só precisa do tamanho do próprio texto, não de alinhar com uma
  // coluna inteira como na tabela de Transações do Mês.
  readonly compactBadgeBaseClass =
    'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border whitespace-nowrap';

  // "Sem casca" — igual TransactionForm, serve tanto de página (AiTransactionEntryPage)
  // quanto de modal (AiTransactionEntryModal). created: uma leva foi salva com sucesso.
  // cancelled: usuário clicou em "Cancelar" (os dois pontos do fluxo — antes e depois de
  // analisar — chamam o mesmo cancel()).
  readonly created = output<void>();
  readonly cancelled = output<void>();

  private readonly aiService = inject(AiService);
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);

  readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });
  readonly accounts = toSignal(this.accountService.getAll(), { initialValue: [] });
  // Precisamos do registro completo da transação pendente (não só o Id) pra montar o
  // PUT de atualização quando o usuário aceita um vínculo sugerido pela IA.
  private readonly allTransactions = toSignal(this.transactionService.getAll(), { initialValue: [] });

  private readonly defaultAccountId = computed(() => {
    const list = this.accounts();
    return list.find((account) => account.type === 'Checking')?.id ?? list[0]?.id ?? '';
  });

  readonly promptText = signal('');
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly proposals = signal<ProposalRow[] | null>(null);

  // Usado pelo Modal (ver AiTransactionEntryModal) pra decidir se fechar pelo X pede
  // confirmação — texto digitado ou já ter analisado (mesmo sem ter confirmado ainda)
  // conta como "tem algo que se perde ao fechar".
  readonly isDirty = computed(() => this.promptText().trim().length > 0 || this.proposals() !== null);

  categoriesForType(type: TransactionType) {
    return this.categories().filter((category) => category.type === type);
  }

  categoryColor(categoryId: string): string {
    return this.categories().find((category) => category.id === categoryId)?.color ?? '#D1D5DB';
  }

  categoryIcon(categoryId: string): string {
    return this.categories().find((category) => category.id === categoryId)?.icon ?? '';
  }

  categoryName(categoryId: string): string {
    return this.categories().find((category) => category.id === categoryId)?.name ?? '—';
  }

  accountColor(accountId: string): string {
    return this.accounts().find((account) => account.id === accountId)?.color ?? '#9CA3AF';
  }

  accountName(accountId: string): string {
    return this.accounts().find((account) => account.id === accountId)?.name ?? '';
  }

  toggleType(row: ProposalRow): void {
    row.type = row.type === 'Expense' ? 'Income' : 'Expense';
    this.onTypeChange(row);
  }

  toggleEdit(row: ProposalRow): void {
    row.isEditing = !row.isEditing;
  }

  // "05/08" a partir do "yyyy-MM-dd" já guardado na linha — direto na string, sem passar
  // por Date, pra não correr risco de fuso horário deslocar o dia exibido. Sem o ano
  // (igual a tabela de Transações do Mês) — o ano quase nunca muda dentro de uma mesma
  // leva de lançamentos, então só polui.
  formatDateDisplay(dateInputValue: string): string {
    const [, month, day] = dateInputValue.split('-');
    return `${day}/${month}`;
  }

  // Agrupamento pra tela de revisão (ver template): confirmando pendência primeiro
  // (o que já existia), depois receitas novas, depois despesas novas — nunca um bloco
  // só misturando tudo. Métodos comuns (não computed()) pelo mesmo motivo de
  // canConfirm/linkedCount/newCount acima: precisam reagir a mutação de linha, não só a
  // troca do array inteiro.
  pendingMatchRows(): ProposalRow[] {
    return this.proposals()?.filter((row) => row.matchedPendingTransactionId && row.linkToMatch) ?? [];
  }

  newIncomeRows(): ProposalRow[] {
    return (
      this.proposals()?.filter(
        (row) => row.type === 'Income' && !(row.matchedPendingTransactionId && row.linkToMatch),
      ) ?? []
    );
  }

  newExpenseRows(): ProposalRow[] {
    return (
      this.proposals()?.filter(
        (row) => row.type === 'Expense' && !(row.matchedPendingTransactionId && row.linkToMatch),
      ) ?? []
    );
  }

  analyze(): void {
    const text = this.promptText().trim();

    if (!text) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.proposals.set(null);

    this.aiService.parse(text).subscribe({
      next: (results) => {
        this.loading.set(false);

        const defaultAccountId = this.defaultAccountId();
        const validCategoryIds = new Set(this.categories().map((category) => category.id));
        const validAccountIds = new Set(this.accounts().map((account) => account.id));
        const pendingById = new Map(
          this.allTransactions()
            .filter((transaction) => transaction.status === 'Pending')
            .map((transaction) => [transaction.id, transaction]),
        );

        this.proposals.set(
          results.map((result) => {
            // Idem cautela do categoryId/accountId abaixo: só confia no vínculo sugerido
            // se o Id realmente existir e ainda estiver Pendente (pode ter sido pago ou
            // excluído entre a IA responder e este map rodar).
            const matchedPendingTransactionId =
              result.matchedPendingTransactionId && pendingById.has(result.matchedPendingTransactionId)
                ? result.matchedPendingTransactionId
                : null;
            const matchedTransaction = matchedPendingTransactionId
              ? pendingById.get(matchedPendingTransactionId)
              : undefined;

            return {
              localId: crypto.randomUUID(),
              type: result.type === 'Income' ? 'Income' : 'Expense',
              // Numa linha vinculada, a descrição real da pendência ("Laboclin") deixa
              // claro do que se trata — bem mais direto que a paráfrase genérica da IA
              // ("Recebimento de transação"), que foi exatamente o que confundiu antes.
              description: matchedTransaction?.description ?? result.description,
              amount: result.amount,
              date: this.isoToInputValue(result.date),
              // Idem: categoria/conta da própria pendência já cadastrada são mais
              // confiáveis que um novo palpite da IA pro mesmo lançamento.
              categoryId:
                matchedTransaction?.categoryId ??
                (result.categoryId && validCategoryIds.has(result.categoryId) ? result.categoryId : ''),
              accountId:
                matchedTransaction?.accountId ??
                (result.accountId && validAccountIds.has(result.accountId) ? result.accountId : defaultAccountId),
              matchedPendingTransactionId,
              matchedPendingLabel: matchedPendingTransactionId ? result.matchedPendingLabel : null,
              matchedPendingAmount: matchedTransaction?.amount ?? null,
              // Vinculado por padrão quando a IA encontrou uma pendência — ainda dá pra
              // desfazer clicando em "desvincular" na linha (nunca é definitivo até
              // clicar em Confirmar lá embaixo).
              linkToMatch: matchedPendingTransactionId !== null,
              isEditing: false,
            };
          }),
        );
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.extractErrorMessage(err));
      },
    });
  }

  onTypeChange(row: ProposalRow): void {
    const stillValid = this.categoriesForType(row.type).some((category) => category.id === row.categoryId);

    if (!stillValid) {
      row.categoryId = '';
    }
  }

  removeRow(localId: string): void {
    this.proposals.update((rows) => rows?.filter((row) => row.localId !== localId) ?? null);
  }

  acceptMatch(row: ProposalRow): void {
    row.linkToMatch = true;
  }

  declineMatch(row: ProposalRow): void {
    row.linkToMatch = false;
  }

  startOver(): void {
    this.proposals.set(null);
    this.errorMessage.set(null);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  // Métodos normais (não computed()) de propósito: os campos de cada linha (categoryId,
  // linkToMatch etc.) são mutados diretamente pelo ngModel/pelos botões de aceitar-vínculo
  // — mutação em objeto dentro do array, não um novo array via proposals.set(). Um
  // computed() só reage a re-set() do signal, então ficaria com valor "congelado" do
  // primeiro cálculo; método comum reavalia a cada ciclo de detecção de mudanças, então
  // sempre reflete o estado atual das linhas.
  canConfirm(): boolean {
    const rows = this.proposals();
    return (
      !!rows &&
      rows.length > 0 &&
      rows.every((row) => row.categoryId && row.accountId && row.amount > 0 && row.description.trim().length > 0)
    );
  }

  linkedCount(): number {
    return this.proposals()?.filter((row) => row.matchedPendingTransactionId && row.linkToMatch).length ?? 0;
  }

  newCount(): number {
    return (this.proposals()?.length ?? 0) - this.linkedCount();
  }

  confirmCreate(): void {
    const rows = this.proposals();

    if (!rows || rows.length === 0 || !this.canConfirm()) {
      return;
    }

    this.creating.set(true);
    this.errorMessage.set(null);

    const allTransactions = this.allTransactions();

    const requests = rows.map((row) => {
      // Vínculo aceito: atualiza a transação PENDENTE já existente (marcando como paga)
      // em vez de criar uma nova — é a mesma operação do botão "Receber"/"Pagar" da
      // tabela, só que disparada por aqui. Reaproveita os campos originais (recorrência,
      // parcelamento etc.) que não aparecem nesta tela de revisão, só sobrescrevendo o
      // que o usuário pode ter ajustado (categoria, conta, tipo, valor, descrição, data).
      if (row.matchedPendingTransactionId && row.linkToMatch) {
        const original = allTransactions.find((t) => t.id === row.matchedPendingTransactionId);

        if (original) {
          return this.transactionService.update(row.matchedPendingTransactionId, {
            accountId: row.accountId,
            creditCardId: original.creditCardId,
            categoryId: row.categoryId,
            subcategoryId: original.subcategoryId,
            type: row.type,
            status: 'Paid',
            amount: row.amount,
            description: row.description,
            date: `${row.date}T00:00:00Z`,
            isFixed: original.isFixed,
            installmentInfo: original.installmentInfo,
            recurrenceGroupId: original.recurrenceGroupId,
            recurrenceDay: original.recurrenceDay,
            recurrenceEndDate: original.recurrenceEndDate,
            installmentNumber: original.installmentNumber,
            totalInstallments: original.totalInstallments,
            paidDate: original.paidDate,
            purchaseDate: original.purchaseDate,
          });
        }
      }

      return this.transactionService.create({
        accountId: row.accountId,
        creditCardId: null,
        categoryId: row.categoryId,
        subcategoryId: null,
        type: row.type,
        status: 'Pending',
        amount: row.amount,
        description: row.description,
        date: `${row.date}T00:00:00Z`,
        isFixed: false,
        installmentInfo: null,
        recurrenceGroupId: null,
        recurrenceDay: null,
        recurrenceEndDate: null,
        installmentNumber: null,
        totalInstallments: null,
        paidDate: null,
        purchaseDate: null,
      });
    });

    forkJoin(requests).subscribe({
      next: () => {
        this.creating.set(false);
        this.created.emit();
      },
      error: () => {
        this.creating.set(false);
        this.errorMessage.set('Falha ao salvar uma ou mais transações. Tente novamente.');
      },
    });
  }

  private extractErrorMessage(err: unknown): string {
    const httpError = err as { error?: unknown; status?: number };

    if (typeof httpError?.error === 'string' && httpError.error.trim().length > 0) {
      return httpError.error;
    }

    if (httpError?.status === 0) {
      return 'Não foi possível conectar à API. Verifique sua conexão e tente de novo.';
    }

    return 'Não foi possível interpretar o texto. Tente reescrever de um jeito mais direto.';
  }

  // Mesma cautela de fuso horário já usada no formulário de transação: lê os
  // componentes UTC da data que veio do backend pro formato "yyyy-MM-dd" do
  // <input type="date">.
  private isoToInputValue(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
      return this.todayAsInputValue();
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private todayAsInputValue(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
