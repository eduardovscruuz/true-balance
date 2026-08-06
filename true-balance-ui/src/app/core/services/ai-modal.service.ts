import { Injectable, signal } from '@angular/core';

// Estado global de "o modal de Lançar com IA está aberto?" — mesmo padrão do
// TransactionModalService, só que sem payload nenhum (o fluxo da IA não depende de tipo
// nem de conta/cartão pré-selecionado).
@Injectable({ providedIn: 'root' })
export class AiModalService {
  private readonly _isOpen = signal(false);
  readonly isOpen = this._isOpen.asReadonly();

  openModal(): void {
    this._isOpen.set(true);
  }

  close(): void {
    this._isOpen.set(false);
  }
}
