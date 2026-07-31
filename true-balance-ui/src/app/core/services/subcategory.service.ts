import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CreateSubcategory, Subcategory } from '../models/subcategory.model';

@Injectable({ providedIn: 'root' })
export class SubcategoryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/subcategories`;

  getAll(): Observable<Subcategory[]> {
    return this.http.get<Subcategory[]>(this.apiUrl);
  }

  getById(id: string): Observable<Subcategory> {
    return this.http.get<Subcategory>(`${this.apiUrl}/${id}`);
  }

  create(dto: CreateSubcategory): Observable<Subcategory> {
    return this.http.post<Subcategory>(this.apiUrl, dto);
  }

  update(id: string, dto: CreateSubcategory): Observable<Subcategory> {
    return this.http.put<Subcategory>(`${this.apiUrl}/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
