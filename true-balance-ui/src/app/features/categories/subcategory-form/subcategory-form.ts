import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SubcategoryService } from '../../../core/services/subcategory.service';

@Component({
  selector: 'app-subcategory-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './subcategory-form.html',
  styleUrl: './subcategory-form.scss',
})
export class SubcategoryForm implements OnInit {
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);

  readonly categoryId = this.route.snapshot.paramMap.get('categoryId')!;

  private readonly subcategoryId = signal<string | null>(null);
  readonly isEditMode = () => this.subcategoryId() !== null;

  form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (id === null) {
      return;
    }

    this.subcategoryId.set(id);

    this.subcategoryService.getById(id).subscribe((subcategory) => {
      this.form.patchValue({ name: subcategory.name });
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const dto = { categoryId: this.categoryId, name: this.form.getRawValue().name };
    const id = this.subcategoryId();

    const request$ = id === null ? this.subcategoryService.create(dto) : this.subcategoryService.update(id, dto);

    request$.subscribe(() => {
      this.router.navigate(['/categories', this.categoryId, 'subcategories']);
    });
  }
}
