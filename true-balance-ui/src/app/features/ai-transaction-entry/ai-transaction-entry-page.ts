import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AiTransactionEntry } from './ai-transaction-entry';

// Casca de página pra AiTransactionEntry: usada pela rota /transactions/ai. Salvar e
// cancelar levam pro mesmo lugar (/transactions), igual o comportamento de antes de
// AiTransactionEntry virar reutilizável (ver AiTransactionEntryModal pro outro host).
@Component({
  selector: 'app-ai-transaction-entry-page',
  imports: [AiTransactionEntry],
  templateUrl: './ai-transaction-entry-page.html',
})
export class AiTransactionEntryPage {
  private readonly router = inject(Router);

  onDone(): void {
    this.router.navigate(['/transactions']);
  }
}
