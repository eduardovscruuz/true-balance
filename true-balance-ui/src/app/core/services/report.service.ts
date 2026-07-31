import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { MonthlyBalance } from '../models/monthly-balance.model';
import { MonthlySummary } from '../models/monthly-summary.model';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getBalances(year: number): Observable<MonthlyBalance[]> {
    return this.http.get<MonthlyBalance[]>(`${this.apiUrl}/reports/balances/${year}`);
  }

  getSummaries(year: number, month: number): Observable<MonthlySummary[]> {
    return this.http.get<MonthlySummary[]>(`${this.apiUrl}/reports/summaries/${year}/${month}`);
  }
}
