import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';

// Wrapper genérico de modal: header (título + botão de fechar), conteúdo projetado via
// <ng-content>, footer só com "Salvar". Quem usa isso decide o QUE mostrar dentro — este
// componente só cuida da casca (overlay escuro, trava o scroll de fundo, anima
// entrada/saída, confirma antes de fechar se tiver algo não salvo — com um ConfirmDialog
// próprio empilhado por cima, não o confirm() feio do navegador).
@Component({
  selector: 'app-modal',
  imports: [LucideAngularModule, ConfirmDialog],
  templateUrl: './modal.html',
})
export class Modal {
  readonly title = input<string>('');
  // Controla se fechar (X ou clique fora) pede confirmação antes — true assim que o
  // conteúdo projetado tiver alguma mudança real do usuário, ver TransactionForm.isDirty.
  readonly isDirty = input<boolean>(false);
  // true durante o salvamento em si (chamada em andamento) — desabilita o botão e mostra
  // "Salvando..." pra evitar duplo clique.
  readonly saving = input<boolean>(false);
  // Nem todo conteúdo projetado quer o footer padrão de "Salvar" único — fluxos com
  // múltiplas etapas/ações (ex: Lançar com IA: Analisar, depois Confirmar/Refazer) já têm
  // seus próprios botões dentro do conteúdo. false esconde o footer inteiro; quem chama
  // usa attemptClose() (via referência de template) pros próprios botões de cancelar.
  //
  // Quando o footer padrão está visível mas precisa de mais que só o "Salvar" (ex: um
  // "Excluir" ao lado, em modo edição — ver TransactionFormModal), projete um elemento
  // com o atributo modalFooterStart — ele aparece à esquerda, dentro do footer.
  readonly showFooter = input<boolean>(true);
  // Largura do cartão — 'md' pros formulários normais, 'xl' pra conteúdo mais largo
  // (tabelas, ex: revisão da IA).
  readonly size = input<'md' | 'xl'>('md');

  readonly close = output<void>();
  readonly save = output<void>();

  // Entrada/saída animadas (ver comentário no construtor) — quem usa este componente só
  // sabe de "close" (emitido depois da transição de saída já ter tocado, não antes).
  protected readonly visible = signal(false);
  protected readonly closing = signal(false);
  protected readonly showDiscardConfirm = signal(false);

  constructor() {
    // Um tick depois de criado, pra o navegador animar a transição do estado inicial
    // (invisível/encolhido) pro final — no mesmo frame da criação não haveria "antes"
    // visual pra animar a partir dele.
    setTimeout(() => this.visible.set(true));

    // Enquanto o modal existir, a tela de trás não pode rolar — sem isso dava pra
    // scrollar o conteúdo por baixo do overlay. Quem rola de verdade não é <body> (ver
    // app.html: o layout é nav fixo + #app-scroll-container ocupando o resto da altura),
    // então é nele que a trava precisa entrar. O espaço da barra já fica reservado sempre
    // (scrollbar-gutter: stable nesse container, em styles.scss), então só "overflow:
    // hidden" basta — sem precisar calcular/compensar nada aqui.
    const scrollContainer = document.getElementById('app-scroll-container');
    const previousOverflow = scrollContainer?.style.overflow ?? '';
    if (scrollContainer) {
      scrollContainer.style.overflow = 'hidden';
    }

    inject(DestroyRef).onDestroy(() => {
      if (scrollContainer) {
        scrollContainer.style.overflow = previousOverflow;
      }
    });
  }

  attemptClose(): void {
    if (this.isDirty()) {
      this.showDiscardConfirm.set(true);
      return;
    }

    this.startClosing();
  }

  onDiscardConfirmed(): void {
    this.showDiscardConfirm.set(false);
    this.startClosing();
  }

  onDiscardCancelled(): void {
    this.showDiscardConfirm.set(false);
  }

  onSaveClick(): void {
    this.save.emit();
  }

  private startClosing(): void {
    this.closing.set(true);
    // Precisa bater com a duration da transição CSS (ver modal.html) — só emite close()
    // (que faz quem usa isso tirar o modal do DOM via @if) depois da animação já ter tocado.
    setTimeout(() => this.close.emit(), 150);
  }
}
