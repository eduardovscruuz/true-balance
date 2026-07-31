import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { InitialsPipe } from '../../../shared/pipes/initials.pipe';
import { ACCOUNT_TYPE_LABELS } from '../../../core/models/account.model';
import { AccountService } from '../../../core/services/account.service';

@Component({
  selector: 'app-account-list',
  imports: [RouterLink, CurrencyPipe, DatePipe, InitialsPipe, LucideAngularModule],
  templateUrl: './account-list.html',
  styleUrl: './account-list.scss',
})
export class AccountList {
  private readonly accountService = inject(AccountService);

  readonly accountTypeLabels = ACCOUNT_TYPE_LABELS;

  private readonly refreshTrigger = signal(0);

  accounts = toSignal(toObservable(this.refreshTrigger).pipe(switchMap(() => this.accountService.getAll())), {
    initialValue: [],
  });

  deleteAccount(id: string, name: string): void {
    if (!confirm(`Excluir a conta "${name}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    this.accountService.delete(id).subscribe({
      next: () => this.refreshTrigger.update((n) => n + 1),
      error: () => alert('Não foi possível excluir. Essa conta provavelmente tem transações vinculadas.'),
    });
  }
}
