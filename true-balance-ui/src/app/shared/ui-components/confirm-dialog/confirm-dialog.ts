import { Component, input, output, signal } from '@angular/core';

// Confirmação genérica, no mesmo estilo visual do resto do app — usada em vez do
// confirm() nativo do navegador (feio, fora de contexto) quando algo precisa de um "tem
// certeza?" mais bonito. Pensada pra empilhar em cima de outro modal (ver Modal), por
// isso o z-index mais alto — não é um modal "principal" sozinho.
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  readonly title = input<string>('Tem certeza?');
  readonly message = input<string>('');
  readonly confirmLabel = input<string>('Confirmar');
  readonly cancelLabel = input<string>('Cancelar');
  // Botão de confirmar em vermelho quando a ação é destrutiva (ex: descartar alterações,
  // excluir) — azul (padrão) quando é só uma confirmação neutra.
  readonly danger = input<boolean>(false);
  // Opcional: quando setado, aparece um TERCEIRO botão entre Cancelar e Confirmar — pra
  // escolhas de 3 vias (ex: TransactionForm perguntando se uma mudança vale só pra esta
  // ocorrência ou pra ela e as próximas pendentes da série). null = só os 2 botões normais.
  readonly secondaryLabel = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly secondarySelected = output<void>();
  readonly cancelled = output<void>();

  protected readonly visible = signal(false);
  protected readonly closing = signal(false);

  constructor() {
    // Um tick depois de criado, pra o navegador animar a transição do estado inicial
    // (invisível/encolhido) pro final — se ligasse no mesmo frame da criação, não haveria
    // "antes" visual pra animar a partir dele.
    setTimeout(() => this.visible.set(true));
  }

  onCancel(): void {
    this.startClosing(() => this.cancelled.emit());
  }

  onSecondary(): void {
    this.startClosing(() => this.secondarySelected.emit());
  }

  onConfirm(): void {
    this.startClosing(() => this.confirmed.emit());
  }

  private startClosing(after: () => void): void {
    this.closing.set(true);
    // Precisa bater com a duration da transição CSS (ver confirm-dialog.html) — só remove
    // do DOM (via o @if de quem usa isso) depois da animação de saída já ter tocado.
    setTimeout(after, 150);
  }
}
