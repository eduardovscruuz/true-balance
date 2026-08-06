import { Component, input, output, viewChild } from '@angular/core';

import { Modal } from '../../../shared/ui-components/modal/modal';
import { CreditCardForm } from '../credit-card-form/credit-card-form';

// Casca de modal pra CreditCardForm — cobre criação e edição (ver CreditCardList, que
// controla a abertura com um signal local — diferente do modal de transação, não precisa
// ser global: só a lista de cartões abre isso).
@Component({
  selector: 'app-credit-card-form-modal',
  imports: [Modal, CreditCardForm],
  templateUrl: './credit-card-form-modal.html',
})
export class CreditCardFormModal {
  readonly creditCardId = input<string | null>(null);
  readonly closed = output<void>();
  // Separado de "closed" de propósito — quem chama (CreditCardList) só precisa rebuscar
  // os cartões quando algo realmente mudou, não quando o usuário só cancelou sem salvar.
  readonly saved = output<void>();

  readonly formRef = viewChild(CreditCardForm);

  onSave(): void {
    this.formRef()?.onSubmit();
  }

  onSaved(): void {
    this.saved.emit();
    this.closed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
