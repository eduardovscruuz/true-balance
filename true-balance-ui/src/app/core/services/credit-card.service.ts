import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CreateCreditCard, CreditCard } from '../models/credit-card.model';

@Injectable({ providedIn: 'root' })
export class CreditCardService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/creditcards`;

  getAll(): Observable<CreditCard[]> {
    return this.http.get<CreditCard[]>(this.apiUrl);
  }

  getById(id: string): Observable<CreditCard> {
    return this.http.get<CreditCard>(`${this.apiUrl}/${id}`);
  }

  create(dto: CreateCreditCard): Observable<CreditCard> {
    return this.http.post<CreditCard>(this.apiUrl, dto);
  }

  update(id: string, dto: CreateCreditCard): Observable<CreditCard> {
    return this.http.put<CreditCard>(`${this.apiUrl}/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
