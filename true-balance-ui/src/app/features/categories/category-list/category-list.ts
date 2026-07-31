import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';
import { CategoryService } from '../../../core/services/category.service';

@Component({
  selector: 'app-category-list',
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './category-list.html',
  styleUrl: './category-list.scss',
})
export class CategoryList {
  private readonly categoryService = inject(CategoryService);

  // Incrementar isso força um novo GET — é como "refazemos a lista" depois de excluir.
  private readonly refreshTrigger = signal(0);

  categories = toSignal(
    toObservable(this.refreshTrigger).pipe(switchMap(() => this.categoryService.getAll())),
    { initialValue: [] },
  );

  readonly resolveIconName = resolveLucideIconName;

  deleteCategory(id: string, name: string): void {
    if (!confirm(`Excluir a categoria "${name}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    this.categoryService.delete(id).subscribe({
      next: () => this.refreshTrigger.update((n) => n + 1),
      error: () =>
        alert('Não foi possível excluir. Essa categoria provavelmente tem transações ou subcategorias vinculadas.'),
    });
  }
}
