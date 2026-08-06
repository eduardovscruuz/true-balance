import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { AiTransactionEntryModal } from './features/ai-transaction-entry-modal/ai-transaction-entry-modal';
import { TransactionFormModal } from './features/transactions/transaction-form-modal/transaction-form-modal';
import { AiModalService } from './core/services/ai-modal.service';
import { MonthSelectionService } from './core/services/month-selection.service';
import { TransactionModalService } from './core/services/transaction-modal.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, TransactionFormModal, AiTransactionEntryModal],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly monthSelection = inject(MonthSelectionService);
  protected readonly transactionModal = inject(TransactionModalService);
  protected readonly aiModal = inject(AiModalService);

  // Menu "+" do header — mesmas 3 ações dos botões grandes do Dashboard, só que
  // acessível de qualquer tela.
  protected readonly newMenuOpen = signal(false);

  toggleNewMenu(): void {
    this.newMenuOpen.update((open) => !open);
  }

  closeNewMenu(): void {
    this.newMenuOpen.set(false);
  }
}
