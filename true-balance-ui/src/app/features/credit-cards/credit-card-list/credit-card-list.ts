import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { CreditCardService } from '../../../core/services/credit-card.service';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';

@Component({
  selector: 'app-credit-card-list',
  imports: [RouterLink, CurrencyPipe, LucideAngularModule],
  templateUrl: './credit-card-list.html',
  styleUrl: './credit-card-list.scss',
})
export class CreditCardList {
  private readonly creditCardService = inject(CreditCardService);

  private readonly refreshTrigger = signal(0);

  // Cartões cadastrados antes do campo existir não têm cor/ícone — cai num cinza neutro.
  readonly resolveIconName = (icon: string | null) => resolveLucideIconName(icon ?? '');
  readonly cardColor = (color: string | null) => color ?? '#9CA3AF';

  creditCards = toSignal(
    toObservable(this.refreshTrigger).pipe(switchMap(() => this.creditCardService.getAll())),
    { initialValue: [] },
  );

  deleteCreditCard(id: string, name: string): void {
    if (!confirm(`Excluir o cartão "${name}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    this.creditCardService.delete(id).subscribe({
      next: () => this.refreshTrigger.update((n) => n + 1),
      error: () => alert('Não foi possível excluir. Esse cartão provavelmente tem transações vinculadas.'),
    });
  }
}
