import { Component, inject, output, viewChild } from '@angular/core';

import { Modal } from '../../shared/ui-components/modal/modal';
import { TransactionService } from '../../core/services/transaction.service';
import { AiTransactionEntry } from '../ai-transaction-entry/ai-transaction-entry';

// Casca de modal pra AiTransactionEntry (ver AiModalService). Sem footer próprio do
// Modal (showFooter=false) — o conteúdo já tem seus próprios botões pra cada etapa
// (Analisar, depois Confirmar/Refazer/Cancelar), então só reaproveitamos o Modal pelo
// overlay/animação/trava-de-scroll/confirmação-de-descarte, não pelo footer de "Salvar".
@Component({
  selector: 'app-ai-transaction-entry-modal',
  imports: [Modal, AiTransactionEntry],
  templateUrl: './ai-transaction-entry-modal.html',
})
export class AiTransactionEntryModal {
  private readonly transactionService = inject(TransactionService);

  readonly closed = output<void>();

  readonly contentRef = viewChild(AiTransactionEntry);

  onCreated(): void {
    this.transactionService.notifyChanged();
    this.closed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
