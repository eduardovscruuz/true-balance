import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { CategoryService } from '../../../core/services/category.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';

@Component({
  selector: 'app-subcategory-list',
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './subcategory-list.html',
  styleUrl: './subcategory-list.scss',
})
export class SubcategoryList {
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly route = inject(ActivatedRoute);

  readonly categoryId = this.route.snapshot.paramMap.get('categoryId')!;

  readonly category = toSignal(this.categoryService.getById(this.categoryId));

  private readonly refreshTrigger = signal(0);

  private readonly allSubcategories = toSignal(
    toObservable(this.refreshTrigger).pipe(switchMap(() => this.subcategoryService.getAll())),
    { initialValue: [] },
  );

  // Não existe endpoint de backend filtrando subcategoria por categoria — busca tudo
  // e filtra no cliente. Aceitável dado o volume esperado (uso pessoal, poucas dezenas).
  readonly subcategories = computed(() =>
    this.allSubcategories().filter((subcategory) => subcategory.categoryId === this.categoryId),
  );

  deleteSubcategory(id: string, name: string): void {
    if (!confirm(`Excluir a subcategoria "${name}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    this.subcategoryService.delete(id).subscribe({
      next: () => this.refreshTrigger.update((n) => n + 1),
      error: () =>
        alert('Não foi possível excluir. Essa subcategoria provavelmente tem transações vinculadas.'),
    });
  }
}
