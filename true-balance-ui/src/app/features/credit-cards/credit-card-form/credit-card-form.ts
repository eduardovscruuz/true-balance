import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { AccountService } from '../../../core/services/account.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { IconPicker } from '../../../shared/ui-components/icon-picker/icon-picker';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';

@Component({
  selector: 'app-credit-card-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyMaskDirective, LucideAngularModule, IconPicker],
  templateUrl: './credit-card-form.html',
  styleUrl: './credit-card-form.scss',
})
export class CreditCardForm implements OnInit {
  private readonly creditCardService = inject(CreditCardService);
  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);

  private readonly creditCardId = signal<string | null>(null);
  readonly isEditMode = () => this.creditCardId() !== null;

  readonly accounts = toSignal(this.accountService.getAll(), { initialValue: [] });

  form = this.formBuilder.group({
    name: this.formBuilder.nonNullable.control('', Validators.required),
    closingDay: this.formBuilder.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(31),
    ]),
    dueDay: this.formBuilder.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(31)]),
    // Sem valor inicial de propósito, igual o saldo da conta: campo começa vazio (só placeholder).
    limit: this.formBuilder.control<number | null>(null),
    // Conta de onde a fatura sai quando é paga — sem isso, as compras no cartão ficam
    // invisíveis pro fluxo de caixa/projeção de saldo de qualquer conta no Dashboard.
    paymentAccountId: this.formBuilder.nonNullable.control(''),
    // Igual Category (color/icon) — usado pra representar o cartão com um selo colorido
    // na coluna Categoria de "Transações do Mês", já que a fatura ali é agrupada.
    color: this.formBuilder.nonNullable.control('#3B82F6', Validators.required),
    icon: this.formBuilder.nonNullable.control('', Validators.required),
  });

  private readonly iconValue = toSignal(this.form.controls.icon.valueChanges, {
    initialValue: this.form.controls.icon.value,
  });

  readonly previewIconName = () => resolveLucideIconName(this.iconValue());

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (id === null) {
      return;
    }

    this.creditCardId.set(id);

    this.creditCardService.getById(id).subscribe((creditCard) => {
      this.form.patchValue({
        name: creditCard.name,
        closingDay: creditCard.closingDay,
        dueDay: creditCard.dueDay,
        limit: creditCard.limit,
        paymentAccountId: creditCard.paymentAccountId ?? '',
        color: creditCard.color ?? '#3B82F6',
        icon: creditCard.icon ?? '',
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, closingDay, dueDay, limit, paymentAccountId, color, icon } = this.form.getRawValue();
    const dto = {
      name,
      closingDay: closingDay ?? 0,
      dueDay: dueDay ?? 0,
      limit: limit ?? 0,
      paymentAccountId: paymentAccountId || null,
      color,
      icon,
    };
    const id = this.creditCardId();

    const request$ = id === null ? this.creditCardService.create(dto) : this.creditCardService.update(id, dto);

    request$.subscribe(() => {
      this.router.navigate(['/credit-cards']);
    });
  }
}
