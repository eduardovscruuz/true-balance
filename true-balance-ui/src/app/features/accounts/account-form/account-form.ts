import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { ACCOUNT_TYPE_OPTIONS, AccountType } from '../../../core/models/account.model';
import { AccountService } from '../../../core/services/account.service';

@Component({
  selector: 'app-account-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyMaskDirective],
  templateUrl: './account-form.html',
  styleUrl: './account-form.scss',
})
export class AccountForm implements OnInit {
  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);

  readonly accountTypes = ACCOUNT_TYPE_OPTIONS;

  // Presente = modo edição (veio de /accounts/:id/edit); ausente = modo criação.
  private readonly accountId = signal<string | null>(null);
  readonly isEditMode = () => this.accountId() !== null;

  form = this.formBuilder.group({
    name: this.formBuilder.nonNullable.control('', Validators.required),
    type: this.formBuilder.nonNullable.control<AccountType>('Checking', Validators.required),
    color: this.formBuilder.nonNullable.control('#3B82F6', Validators.required),
    // Sem valor inicial de propósito: o campo começa vazio (só placeholder),
    // não com "R$ 0,00" pré-preenchido. Vazio na hora de salvar = zero.
    balance: this.formBuilder.control<number | null>(null),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (id === null) {
      return;
    }

    this.accountId.set(id);

    this.accountService.getById(id).subscribe((account) => {
      this.form.patchValue({
        name: account.name,
        type: account.type,
        color: account.color,
        balance: account.balance,
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, type, color, balance } = this.form.getRawValue();
    const dto = { name, type, color, balance: balance ?? 0 };
    const id = this.accountId();

    const request$ = id === null ? this.accountService.create(dto) : this.accountService.update(id, dto);

    request$.subscribe(() => {
      this.router.navigate(['/accounts']);
    });
  }
}
