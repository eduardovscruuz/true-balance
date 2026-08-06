import { Component, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CreditCardForm } from './credit-card-form';

// Casca de página pra CreditCardForm — usada pelas rotas /credit-cards/new e
// /credit-cards/:id/edit. Na prática hoje só serve como fallback de link direto: a lista
// de cartões abre os dois fluxos em modal (ver CreditCardFormModal), mas as rotas
// continuam funcionando como página igual antes.
@Component({
  selector: 'app-credit-card-form-page',
  imports: [RouterLink, CreditCardForm],
  templateUrl: './credit-card-form-page.html',
})
export class CreditCardFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly creditCardId = this.route.snapshot.paramMap.get('id');

  readonly formRef = viewChild(CreditCardForm);

  onSaved(): void {
    this.router.navigate(['/credit-cards']);
  }
}
