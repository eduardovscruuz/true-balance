import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { IconPicker } from '../../../shared/ui-components/icon-picker/icon-picker';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';
import { CategoryType } from '../../../core/models/category.model';
import { CategoryService } from '../../../core/services/category.service';

@Component({
  selector: 'app-category-form',
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule, IconPicker],
  templateUrl: './category-form.html',
  styleUrl: './category-form.scss',
})
export class CategoryForm implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);

  private readonly categoryId = signal<string | null>(null);
  readonly isEditMode = () => this.categoryId() !== null;

  form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    type: ['Expense' as CategoryType, Validators.required],
    color: ['#3B82F6', Validators.required],
    icon: ['', Validators.required],
  });

  private readonly iconValue = toSignal(this.form.controls.icon.valueChanges, {
    initialValue: this.form.controls.icon.value,
  });

  // Preview em tempo real: mostra o ícone resolvido (ou o de fallback) enquanto digita,
  // pra não descobrir só depois de salvar que o nome não existe.
  readonly previewIconName = () => resolveLucideIconName(this.iconValue());

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (id === null) {
      return;
    }

    this.categoryId.set(id);

    this.categoryService.getById(id).subscribe((category) => {
      this.form.patchValue({
        name: category.name,
        type: category.type,
        color: category.color,
        icon: category.icon,
      });
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const dto = this.form.getRawValue();
    const id = this.categoryId();

    const request$ = id === null ? this.categoryService.create(dto) : this.categoryService.update(id, dto);

    request$.subscribe(() => {
      this.router.navigate(['/categories']);
    });
  }
}
