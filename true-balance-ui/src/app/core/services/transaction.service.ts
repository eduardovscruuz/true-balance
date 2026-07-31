import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CreateTransaction, Transaction, TransactionStatus } from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/transactions`;

  getAll(): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(this.apiUrl);
  }

  getById(id: string): Observable<Transaction> {
    return this.http.get<Transaction>(`${this.apiUrl}/${id}`);
  }

  getByMonth(year: number, month: number): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${this.apiUrl}/${year}/${month}`);
  }

  create(dto: CreateTransaction): Observable<Transaction> {
    return this.http.post<Transaction>(this.apiUrl, dto);
  }

  update(id: string, dto: CreateTransaction): Observable<Transaction> {
    return this.http.put<Transaction>(`${this.apiUrl}/${id}`, dto);
  }

  // Atualiza esta transação e propaga valor/descrição/categoria/etc pras próximas
  // PENDENTES da mesma série (fixa ou parcelada) — ex: reajuste de mensalidade que
  // deve valer daqui pra frente. Data e Status de cada uma não são alterados.
  updateSeries(id: string, dto: CreateTransaction): Observable<Transaction> {
    return this.http.put<Transaction>(`${this.apiUrl}/${id}/series`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Exclui esta transação e todas as PENDENTES da mesma série (fixa ou parcelada) —
  // as já pagas nunca são afetadas.
  deleteSeries(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}/series`);
  }

  // Usado pelo seletor de mês global (ver MonthSelectionService) pra saber até onde dá
  // pra voltar. Conta sem nenhuma transação faz o backend responder 204 (corpo vazio); o
  // HttpClient resolve isso como `null` sem erro, então o tipo já reflete isso.
  getEarliestDate(): Observable<string | null> {
    return this.http.get<string | null>(`${this.apiUrl}/earliest`);
  }

  // Uma fatura é paga ou não paga por inteiro — nunca "meio paga". Isso marca TODAS as
  // transações daquele cartão que vencem naquele mês de uma vez só. paidDate é opcional
  // (só usado ao marcar como Paga) — sem ele, o backend cai em hoje; informar explicita
  // dá pra registrar um pagamento retroativo (ex: inserindo histórico).
  setInvoiceStatus(
    creditCardId: string,
    year: number,
    month: number,
    status: TransactionStatus,
    paidDate: string | null = null,
  ): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/credit-cards/${creditCardId}/invoices/${year}/${month}/status`, {
      status,
      paidDate,
    });
  }
}
