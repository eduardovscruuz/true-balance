import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AiParsedTransaction } from '../models/ai-parsed-transaction.model';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/ai`;

  parse(text: string): Observable<AiParsedTransaction[]> {
    return this.http.post<AiParsedTransaction[]>(`${this.apiUrl}/parse`, { text });
  }
}
