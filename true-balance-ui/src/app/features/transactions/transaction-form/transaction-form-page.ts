import { Component, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TransactionType } from '../../../core/models/transaction.model';
import { TransactionForm } from './transaction-form';

// Casca de página pra TransactionForm: usada pelas rotas /transactions/new e
// /transactions/:id/edit (Nova Receita, Cartão, Editar — Nova Despesa saiu daqui, ver
// TransactionFormModal). Lê a URL e repassa como inputs pro formulário "sem casca"; desenha
// título + Salvar/Cancelar/Excluir exatamente como era antes de TransactionForm virar
// reutilizável. Chama os métodos do formulário via viewChild em vez de <button type="submit">
// nativo, porque o <form> agora mora dentro do componente filho, não aqui.
@Component({
  selector: 'app-transaction-form-page',
  imports: [RouterLink, TransactionForm],
  templateUrl: './transaction-form-page.html',
})
export class TransactionFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly transactionId = this.route.snapshot.paramMap.get('id');
  readonly initialType = this.resolveInitialType();
  readonly initialSource = this.route.snapshot.queryParamMap.get('source') === 'credit-card' ? 'credit-card' : null;
  readonly initialCreditCardId = this.route.snapshot.queryParamMap.get('creditCardId');

  readonly formRef = viewChild(TransactionForm);

  onSaved(): void {
    this.router.navigate(['/transactions']);
  }

  private resolveInitialType(): TransactionType | null {
    const raw = this.route.snapshot.queryParamMap.get('type');
    return raw === 'Expense' || raw === 'Income' ? raw : null;
  }
}
