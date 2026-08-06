import { Component, inject, input, output, viewChild } from '@angular/core';

import { Modal } from '../../../shared/ui-components/modal/modal';
import { TransactionType } from '../../../core/models/transaction.model';
import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionForm } from '../transaction-form/transaction-form';

// Casca de modal pra TransactionForm — cobre criação (Despesa, Receita, Cartão) e edição
// (transactionId setado, ver TransactionModalService.edit()).
@Component({
  selector: 'app-transaction-form-modal',
  imports: [Modal, TransactionForm],
  templateUrl: './transaction-form-modal.html',
})
export class TransactionFormModal {
  private readonly transactionService = inject(TransactionService);

  readonly transactionId = input<string | null>(null);
  readonly initialType = input<TransactionType | null>(null);
  readonly initialSource = input<'credit-card' | null>(null);
  readonly closed = output<void>();

  readonly formRef = viewChild(TransactionForm);

  onSave(): void {
    this.formRef()?.onSubmit();
  }

  onDelete(): void {
    this.formRef()?.deleteTransaction();
  }

  onSaved(): void {
    // O Dashboard (ou qualquer outra tela que fique montada atrás do modal, sem navegar)
    // não teria outro jeito de saber que precisa rebuscar — ver TransactionService.refresh.
    // Cobre salvar E excluir — deleteTransaction() também emite "saved" (ver TransactionForm).
    this.transactionService.notifyChanged();
    this.closed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
