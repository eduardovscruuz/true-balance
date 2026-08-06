import { Routes } from '@angular/router';

import { AccountForm } from './features/accounts/account-form/account-form';
import { AiTransactionEntryPage } from './features/ai-transaction-entry/ai-transaction-entry-page';
import { AccountList } from './features/accounts/account-list/account-list';
import { CategoryForm } from './features/categories/category-form/category-form';
import { CategoryList } from './features/categories/category-list/category-list';
import { SubcategoryForm } from './features/categories/subcategory-form/subcategory-form';
import { SubcategoryList } from './features/categories/subcategory-list/subcategory-list';
import { CreditCardForm } from './features/credit-cards/credit-card-form/credit-card-form';
import { CreditCardInvoice } from './features/credit-cards/credit-card-invoice/credit-card-invoice';
import { CreditCardList } from './features/credit-cards/credit-card-list/credit-card-list';
import { Dashboard } from './features/dashboard/dashboard';
import { TransactionFormPage } from './features/transactions/transaction-form/transaction-form-page';
import { TransactionList } from './features/transactions/transaction-list/transaction-list';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'categories', component: CategoryList },
  { path: 'categories/new', component: CategoryForm },
  { path: 'categories/:id/edit', component: CategoryForm },
  { path: 'categories/:categoryId/subcategories', component: SubcategoryList },
  { path: 'categories/:categoryId/subcategories/new', component: SubcategoryForm },
  { path: 'categories/:categoryId/subcategories/:id/edit', component: SubcategoryForm },
  { path: 'accounts', component: AccountList },
  { path: 'accounts/new', component: AccountForm },
  { path: 'accounts/:id/edit', component: AccountForm },
  { path: 'credit-cards', component: CreditCardList },
  { path: 'credit-cards/new', component: CreditCardForm },
  { path: 'credit-cards/:id/edit', component: CreditCardForm },
  { path: 'credit-cards/:id/invoice', component: CreditCardInvoice },
  { path: 'transactions', component: TransactionList },
  { path: 'transactions/ai', component: AiTransactionEntryPage },
  { path: 'transactions/new', component: TransactionFormPage },
  { path: 'transactions/:id/edit', component: TransactionFormPage },
];
