import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { TransactionStatus, TransactionType } from '../../../core/models/transaction.model';
import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TransactionService } from '../../../core/services/transaction.service';

@Component({
  selector: 'app-transaction-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyMaskDirective, CurrencyPipe, DatePipe],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.scss',
})
export class TransactionForm implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);

  private readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });
  readonly accounts = toSignal(this.accountService.getAll(), { initialValue: [] });
  readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });
  private readonly subcategories = toSignal(this.subcategoryService.getAll(), { initialValue: [] });

  private readonly transactionId = signal<string | null>(null);
  readonly isEditMode = () => this.transactionId() !== null;

  // Preserva o RecurrenceGroupId original ao editar uma transação que já era fixa —
  // ver comentário completo em onSubmit().
  private originalRecurrenceGroupId: string | null = null;

  // Vindo dos botões "Nova Despesa"/"Nova Receita" da lista (?type=Expense|Income).
  // Quando presente, o tipo já chega implícito e não precisa ser escolhido no formulário.
  private readonly initialType = this.resolveInitialTypeFromQueryParam();

  readonly isTypeImplicit = computed(() => !this.isEditMode() && this.initialType !== null);

  // Vindo do botão "Nova Despesa de Cartão" (?source=credit-card), ou detectado ao
  // carregar uma transação existente que já tem CreditCardId em vez de AccountId.
  // Conta e Cartão são mutuamente exclusivos no modelo (Transaction tem os dois
  // campos nulláveis), então o formulário mostra um seletor OU o outro, nunca os dois.
  readonly isCreditCardMode = signal(this.route.snapshot.queryParamMap.get('source') === 'credit-card');

  readonly formTitle = computed(() => {
    if (this.isEditMode()) {
      return 'Editar Transação';
    }

    if (this.initialType === 'Expense' && this.isCreditCardMode()) {
      return 'Nova Despesa de Cartão';
    }

    if (this.initialType === 'Income' && this.isCreditCardMode()) {
      return 'Registrar Estorno';
    }

    if (this.initialType === 'Expense') {
      return 'Nova Despesa';
    }

    if (this.initialType === 'Income') {
      return 'Nova Receita';
    }

    return 'Nova Transação';
  });

  form = this.formBuilder.group({
    type: this.formBuilder.nonNullable.control<TransactionType>(this.initialType ?? 'Expense', Validators.required),
    categoryId: this.formBuilder.nonNullable.control('', Validators.required),
    subcategoryId: this.formBuilder.nonNullable.control(''),
    accountId: this.formBuilder.nonNullable.control('', Validators.required),
    // Vindo do botão "Registrar Estorno" na tela de fatura (?creditCardId=...), que já
    // sabe em qual cartão o estorno deve entrar — poupa o usuário de selecionar de novo.
    creditCardId: this.formBuilder.nonNullable.control(
      this.route.snapshot.queryParamMap.get('creditCardId') ?? '',
    ),
    amount: this.formBuilder.control<number | null>(null, Validators.required),
    description: this.formBuilder.nonNullable.control('', Validators.required),
    date: this.formBuilder.nonNullable.control(this.todayAsInputValue(), Validators.required),
    status: this.formBuilder.nonNullable.control<TransactionStatus>('Paid', Validators.required),
    isFixed: this.formBuilder.nonNullable.control(false),
    // Dia do mês (1-31) em que a recorrência deveria cair — independente do dia real
    // desta ocorrência específica (ex: salário recorre sempre dia 31, mesmo que uma
    // vez ou outra caia no dia 30 por ter sido recebido um dia antes).
    recurrenceDay: this.formBuilder.control<number | null>(null),
    // Mês final da recorrência (opcional, formato "yyyy-MM" de um <input type="month">) —
    // ex: mensalidade de faculdade que acaba em dezembro. Vazio = repete indefinidamente.
    recurrenceEndDate: this.formBuilder.control<string | null>(null),
    // Compra parcelada com fim definido (ex: empréstimo em 30x) — diferente de isFixed,
    // que se repete indefinidamente. Mutuamente exclusivo com isFixed (ver efeitos abaixo).
    isInstallment: this.formBuilder.nonNullable.control(false),
    installmentNumber: this.formBuilder.control<number | null>(null),
    totalInstallments: this.formBuilder.control<number | null>(null),
  });

  private readonly selectedType = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });

  readonly isFixedValue = toSignal(this.form.controls.isFixed.valueChanges, {
    initialValue: this.form.controls.isFixed.value,
  });

  readonly isInstallmentValue = toSignal(this.form.controls.isInstallment.valueChanges, {
    initialValue: this.form.controls.isInstallment.value,
  });

  private readonly installmentNumberValue = toSignal(this.form.controls.installmentNumber.valueChanges, {
    initialValue: this.form.controls.installmentNumber.value,
  });

  private readonly totalInstallmentsValue = toSignal(this.form.controls.totalInstallments.valueChanges, {
    initialValue: this.form.controls.totalInstallments.value,
  });

  // Validação cruzada simples (a parcela atual não pode ser maior que o total) — não dá
  // pra expressar isso com Validators padrão de um único campo, então fica num computed
  // separado, checado tanto no template quanto no onSubmit.
  readonly installmentRangeInvalid = computed(() => {
    const number = this.installmentNumberValue();
    const total = this.totalInstallmentsValue();
    return number !== null && total !== null && number > total;
  });

  private readonly amountValue = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.value,
  });

  // Quando parcelado, o campo Valor representa o TOTAL da compra (ex: 20 mil em 20x) só na
  // CRIAÇÃO — mais intuitivo digitar o total do que calcular de cabeça o valor de cada
  // parcela. O que é salvo por transação é o valor dividido (ver onSubmit); esse preview
  // só mostra a conta pro usuário conferir visualmente. Em EDIÇÃO, a parcela já existe com
  // seu próprio valor guardado — Valor edita diretamente essa parcela (ex: reajuste da
  // mensalidade), não um total reconstruído, então não faz sentido nem mostrar "total".
  readonly amountLabel = computed(() =>
    this.isInstallmentValue() && !this.isEditMode() ? 'Valor total' : 'Valor',
  );

  readonly installmentAmountPreview = computed(() => {
    if (!this.isInstallmentValue() || this.isEditMode()) {
      return null;
    }

    const total = this.amountValue();
    const count = this.totalInstallmentsValue();

    return total !== null && count !== null && count > 0 ? total / count : null;
  });

  private readonly recurrenceEndDateValue = toSignal(this.form.controls.recurrenceEndDate.valueChanges, {
    initialValue: this.form.controls.recurrenceEndDate.value,
  });

  private readonly dateValue = toSignal(this.form.controls.date.valueChanges, {
    initialValue: this.form.controls.date.value,
  });

  // Comparação lexicográfica de "yyyy-MM" funciona pra ordem cronológica (zero-padded) —
  // não faz sentido a recorrência acabar antes mesmo de começar.
  readonly recurrenceEndDateInvalid = computed(() => {
    const endMonth = this.recurrenceEndDateValue();

    if (!endMonth) {
      return false;
    }

    const startMonth = this.dateValue().slice(0, 7);
    return endMonth < startMonth;
  });

  private readonly selectedCreditCardId = toSignal(this.form.controls.creditCardId.valueChanges, {
    initialValue: this.form.controls.creditCardId.value,
  });

  // Uma compra no cartão pertence à fatura que fecha DEPOIS dela — se o dia da compra é
  // depois do fechamento do cartão, ela já perdeu a fatura deste mês e cai na do mês
  // SEGUINTE (que ainda nem fechou). Na CRIAÇÃO, calculamos isso a partir da data de
  // compra digitada; o vencimento resultante (não a data de compra) é o que vira a Data
  // salva da transação (ver onSubmit) — assim ela aparece agrupada no mês certo em
  // "Transações do Mês", e não no mês em que a compra foi fisicamente feita.
  // Na EDIÇÃO, a Data já É o vencimento (foi calculado assim na criação) — reprocessar
  // como se fosse uma compra nova empurraria erroneamente pra um ciclo ainda mais à
  // frente, então só reconstruímos o fechamento correspondente a partir dele.
  private readonly creditCardInvoiceInfo = computed(() => {
    if (!this.isCreditCardMode()) {
      return null;
    }

    const creditCard = this.creditCards().find((c) => c.id === this.selectedCreditCardId());

    if (!creditCard) {
      return null;
    }

    const [year, month, day] = this.dateValue().split('-').map(Number);

    if (this.isEditMode()) {
      const closingDate = this.creditCardClosingDateFromDueDate(year, month, creditCard.closingDay, creditCard.dueDay);
      return { closingDate, dueDate: new Date(Date.UTC(year, month - 1, day)) };
    }

    return this.computeCreditCardInvoice(year, month, day, creditCard.closingDay, creditCard.dueDay);
  });

  // Trava o Status em Pendente enquanto a fatura em que a compra cai ainda não fechou —
  // não dá pra ter pago algo que ainda nem foi cobrado.
  readonly creditCardInvoiceStillOpen = computed(() => {
    const info = this.creditCardInvoiceInfo();

    if (!info) {
      return false;
    }

    const today = new Date();
    const todayUtcMidnight = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    return todayUtcMidnight < info.closingDate;
  });

  // Só relevante (e só usado, ver onSubmit) na CRIAÇÃO — em edição a Data já é o
  // vencimento, não há nada novo pra prever.
  readonly creditCardDueDatePreview = computed(() =>
    this.isEditMode() ? null : (this.creditCardInvoiceInfo()?.dueDate ?? null),
  );

  // Só mostra categorias compatíveis com o tipo escolhido (Receita/Despesa) —
  // não faz sentido lançar uma despesa numa categoria de receita.
  readonly filteredCategories = computed(() =>
    this.categories().filter((category) => category.type === this.selectedType()),
  );

  private readonly selectedCategoryId = toSignal(this.form.controls.categoryId.valueChanges, {
    initialValue: this.form.controls.categoryId.value,
  });

  // Subcategoria fica sempre visível no formulário, mas com aparência travada
  // (desabilitada) até a categoria escolhida ter pelo menos uma subcategoria.
  readonly filteredSubcategories = computed(() =>
    this.subcategories().filter((subcategory) => subcategory.categoryId === this.selectedCategoryId()),
  );

  readonly hasSubcategories = computed(() => this.filteredSubcategories().length > 0);

  constructor() {
    // Reseta a categoria só quando ela deixa de pertencer ao tipo atual — não a cada
    // mudança de tipo incondicionalmente. Isso importa no modo de edição: o
    // patchValue() do ngOnInit dispara valueChanges no campo "type", e se resetássemos
    // a categoria sempre que o tipo mudasse, apagaríamos a categoria que acabamos de
    // carregar (o efeito roda depois que o patchValue já terminou de aplicar TODOS os
    // campos, então nesse ponto a categoria carregada já é a correta pro tipo carregado).
    effect(() => {
      const type = this.selectedType();
      const currentCategoryId = this.form.controls.categoryId.value;
      const stillValid = this.categories().some(
        (category) => category.id === currentCategoryId && category.type === type,
      );

      if (!stillValid) {
        this.form.controls.categoryId.setValue('');
      }
    });

    // Mesma lógica de timing: reseta a subcategoria só quando ela deixa de pertencer
    // à categoria atual (não muda o valor à toa durante o patchValue do modo edição).
    // O controle fica desabilitado (aparência travada) enquanto a categoria escolhida
    // não tiver nenhuma subcategoria cadastrada.
    effect(() => {
      const hasOptions = this.hasSubcategories();
      const control = this.form.controls.subcategoryId;
      const currentSubcategoryId = control.value;
      const stillValid = this.filteredSubcategories().some((s) => s.id === currentSubcategoryId);

      if (!stillValid) {
        control.setValue('', { emitEvent: false });
      }

      if (hasOptions && control.disabled) {
        control.enable({ emitEvent: false });
      } else if (!hasOptions && control.enabled) {
        control.disable({ emitEvent: false });
      }
    });

    // Mesma lógica de timing do efeito acima: quando o ngOnInit faz patchValue numa
    // transação já fixa, esse efeito roda DEPOIS que o recurrenceDay carregado já foi
    // aplicado, então o preenchimento automático só entra em ação se o valor ainda
    // estiver vazio (dados legados sem esse campo) — nunca sobrescreve um valor real.
    effect(() => {
      const isFixed = this.isFixedValue();
      const control = this.form.controls.recurrenceDay;

      if (isFixed) {
        control.setValidators([Validators.required, Validators.min(1), Validators.max(31)]);

        if (control.value === null) {
          // Numa fixa de cartão, o dia de referência é o vencimento da fatura (estável
          // mês a mês), não o dia da compra em si.
          control.setValue(this.creditCardDueDayFallback() ?? this.dayFromDateValue());
        }
      } else {
        control.clearValidators();
        control.setValue(null);
        // recurrenceEndDate é opcional e só faz sentido quando é fixa.
        this.form.controls.recurrenceEndDate.setValue(null);
      }

      control.updateValueAndValidity({ emitEvent: false });
    });

    // Mesma lógica de timing: os campos de parcela só ficam obrigatórios quando
    // "isInstallment" está marcado. No modo edição, isso roda depois do patchValue,
    // então só preenche um valor padrão pra installmentNumber (1) se ele ainda
    // estiver vazio — nunca sobrescreve a parcela real carregada.
    effect(() => {
      const isInstallment = this.isInstallmentValue();
      const numberControl = this.form.controls.installmentNumber;
      const totalControl = this.form.controls.totalInstallments;

      if (isInstallment) {
        numberControl.setValidators([Validators.required, Validators.min(1)]);
        totalControl.setValidators([Validators.required, Validators.min(1)]);

        if (numberControl.value === null) {
          numberControl.setValue(1);
        }
      } else {
        numberControl.clearValidators();
        totalControl.clearValidators();
        numberControl.setValue(null);
        totalControl.setValue(null);
      }

      numberControl.updateValueAndValidity({ emitEvent: false });
      totalControl.updateValueAndValidity({ emitEvent: false });
    });

    // isFixed (recorrência indefinida) e isInstallment (parcelas com fim definido) são
    // conceitos mutuamente exclusivos — uma transação não pode ser as duas coisas ao
    // mesmo tempo. Marcar uma desmarca a outra automaticamente.
    effect(() => {
      if (this.isFixedValue() && this.form.controls.isInstallment.value) {
        this.form.controls.isInstallment.setValue(false);
      }
    });

    effect(() => {
      if (this.isInstallmentValue() && this.form.controls.isFixed.value) {
        this.form.controls.isFixed.setValue(false);
      }
    });

    // Conta e Cartão são mutuamente exclusivos: só o campo do modo ativo é obrigatório.
    // Só limpa o VALOR do campo que ficou inativo — nunca mexe no valor do campo ativo,
    // então carregar uma transação existente (ngOnInit) não perde o que já foi patchado.
    effect(() => {
      const cardMode = this.isCreditCardMode();
      const accountControl = this.form.controls.accountId;
      const creditCardControl = this.form.controls.creditCardId;

      if (cardMode) {
        accountControl.clearValidators();
        accountControl.setValue('');
        creditCardControl.setValidators(Validators.required);
      } else {
        creditCardControl.clearValidators();
        creditCardControl.setValue('');
        accountControl.setValidators(Validators.required);
      }

      accountControl.updateValueAndValidity({ emitEvent: false });
      creditCardControl.updateValueAndValidity({ emitEvent: false });
    });

    // Enquanto a fatura do cartão ainda não fechou, o Status é travado em Pendente —
    // não dá pra ter pago algo que ainda nem foi cobrado. Assim que a fatura fecha (ou
    // se não for uma compra de cartão), o campo volta a ficar livre pro usuário escolher.
    effect(() => {
      const invoiceStillOpen = this.creditCardInvoiceStillOpen();
      const control = this.form.controls.status;

      if (invoiceStillOpen) {
        control.setValue('Pending', { emitEvent: false });

        if (control.enabled) {
          control.disable({ emitEvent: false });
        }
      } else if (control.disabled) {
        control.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (id === null) {
      return;
    }

    this.transactionId.set(id);

    this.transactionService.getById(id).subscribe((transaction) => {
      this.originalRecurrenceGroupId = transaction.recurrenceGroupId;

      const isInstallment = transaction.installmentNumber !== null && transaction.totalInstallments !== null;

      this.form.patchValue({
        type: transaction.type,
        categoryId: transaction.categoryId,
        subcategoryId: transaction.subcategoryId ?? '',
        accountId: transaction.accountId ?? '',
        creditCardId: transaction.creditCardId ?? '',
        // Edita o valor DESTA parcela diretamente (o que já está salvo) — só na CRIAÇÃO
        // o campo representa o total da compra (ver amountLabel/installmentAmountPreview).
        amount: transaction.amount,
        description: transaction.description,
        date: this.isoToInputValue(transaction.date),
        status: transaction.status,
        isFixed: transaction.isFixed,
        recurrenceDay: transaction.recurrenceDay,
        recurrenceEndDate: transaction.recurrenceEndDate ? this.isoToMonthInputValue(transaction.recurrenceEndDate) : null,
        isInstallment,
        installmentNumber: transaction.installmentNumber,
        totalInstallments: transaction.totalInstallments,
      });

      // Detecta o modo a partir do dado real da transação carregada — não do
      // query param (que só faz sentido na criação, vindo dos botões da lista).
      this.isCreditCardMode.set(transaction.creditCardId !== null);
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.installmentRangeInvalid() || this.recurrenceEndDateInvalid()) {
      this.form.markAllAsTouched();
      return;
    }

    const {
      type,
      categoryId,
      subcategoryId,
      accountId,
      creditCardId,
      amount,
      description,
      date,
      status,
      isFixed,
      recurrenceDay,
      recurrenceEndDate,
      isInstallment,
      installmentNumber,
      totalInstallments,
    } = this.form.getRawValue();

    // Se já era fixa/parcelada (tinha um RecurrenceGroupId) e continua sendo, preserva o
    // mesmo grupo — gerar um novo aqui faria o ProjectionService tratar isso como uma série
    // nova e duplicar as projeções futuras ao lado das que já existem sob o grupo antigo.
    // Só gera um grupo novo se a transação está virando fixa/parcelada agora pela primeira vez.
    const recurrenceGroupId =
      isFixed || isInstallment ? (this.originalRecurrenceGroupId ?? crypto.randomUUID()) : null;

    // Quando parcelado NA CRIAÇÃO, o Valor digitado é o TOTAL — o que é salvo em cada
    // transação (esta e as próximas parcelas geradas automaticamente) é o valor dividido
    // pelo total de parcelas, arredondado pra centavos. Em EDIÇÃO, o Valor já edita
    // diretamente o valor desta parcela (ver amountLabel) — nada pra dividir.
    const amountToSave =
      isInstallment && !this.isEditMode() && amount !== null && totalInstallments
        ? Math.round((amount / totalInstallments) * 100) / 100
        : (amount ?? 0);

    // Numa despesa de cartão NOVA, o que é salvo como Data é o VENCIMENTO da fatura em
    // que a compra cai, não a data de compra digitada — é assim que ela aparece agrupada
    // no mês certo em "Transações do Mês" (ex: compra feita depois do fechamento cai no
    // mês seguinte). Em edição, a Data já é o vencimento, não recalcula.
    const creditCardDueDate = this.creditCardDueDatePreview();
    const dateIso = creditCardDueDate ? creditCardDueDate.toISOString() : `${date}T00:00:00Z`;

    const dto = {
      accountId: this.isCreditCardMode() ? null : accountId,
      creditCardId: this.isCreditCardMode() ? creditCardId : null,
      categoryId,
      subcategoryId: subcategoryId || null,
      type,
      status,
      amount: amountToSave,
      description,
      date: dateIso,
      isFixed,
      installmentInfo: null,
      recurrenceGroupId,
      // O dia de referência da recorrência é o mesmo campo pra fixas e parceladas — pra
      // parceladas não expomos um input próprio no formulário, só derivamos do dia da Data.
      // Numa recorrência de cartão, esse dia é o vencimento da fatura (estável mês a mês),
      // não o dia da compra em si.
      recurrenceDay:
        isFixed || isInstallment ? (recurrenceDay ?? this.creditCardDueDayFallback() ?? this.dayFromDateValue()) : null,
      recurrenceEndDate: isFixed && recurrenceEndDate ? `${recurrenceEndDate}-01T00:00:00Z` : null,
      installmentNumber: isInstallment ? installmentNumber : null,
      totalInstallments: isInstallment ? totalInstallments : null,
    };

    const id = this.transactionId();

    if (id === null) {
      this.transactionService.create(dto).subscribe(() => this.router.navigate(['/transactions']));
      return;
    }

    // Editando uma ocorrência que já fazia parte de uma série (fixa ou parcelada):
    // pergunta se a mudança vale só pra esta ocorrência ou pra ela e todas as próximas
    // PENDENTES também — ex: reajuste de mensalidade que deve valer daqui pra frente,
    // vs. um pagamento atrasado com valor diferente que não deve afetar os próximos meses.
    const isPartOfSeries = this.originalRecurrenceGroupId !== null && (isFixed || isInstallment);

    if (!isPartOfSeries) {
      this.transactionService.update(id, dto).subscribe(() => this.router.navigate(['/transactions']));
      return;
    }

    const updateWholeSeries = confirm(
      `"${description}" faz parte de uma recorrência (fixa ou parcelada).\n\n` +
        `Clique OK para aplicar esta mudança nesta ocorrência e em todas as próximas PENDENTES da série.\n` +
        `Clique Cancelar para alterar só esta ocorrência.`,
    );

    const request$ = updateWholeSeries
      ? this.transactionService.updateSeries(id, dto)
      : this.transactionService.update(id, dto);

    request$.subscribe(() => this.router.navigate(['/transactions']));
  }

  private todayAsInputValue(): string {
    return this.dateToInputValue(new Date());
  }

  // Converte a data ISO vinda do backend (ex: "2026-07-31T00:00:00Z") pro formato
  // "yyyy-MM-dd" que o <input type="date"> espera, usando os componentes UTC —
  // mesma cautela de fuso horário já aplicada no dashboard (Fase 9/11).
  private isoToInputValue(iso: string): string {
    const date = new Date(iso);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Mesma ideia acima, mas pro formato "yyyy-MM" que o <input type="month"> espera.
  private isoToMonthInputValue(iso: string): string {
    const date = new Date(iso);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private dateToInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dayFromDateValue(): number {
    return Number(this.form.controls.date.value.split('-')[2]);
  }

  private creditCardDueDayFallback(): number | null {
    if (!this.isCreditCardMode()) {
      return null;
    }

    return this.creditCards().find((c) => c.id === this.selectedCreditCardId())?.dueDay ?? null;
  }

  // Dada uma data de COMPRA, determina em qual fatura ela cai: se o dia da compra é
  // depois do fechamento do cartão, a fatura fecha no mês seguinte (perdeu a deste mês).
  // O vencimento fica no mesmo mês do fechamento se dueDay > closingDay (venceu antes do
  // próximo fechamento), senão no mês seguinte ao fechamento.
  private computeCreditCardInvoice(
    purchaseYear: number,
    purchaseMonth: number,
    purchaseDay: number,
    closingDay: number,
    dueDay: number,
  ): { closingDate: Date; dueDate: Date } {
    let closingMonth = purchaseMonth;
    let closingYear = purchaseYear;

    if (purchaseDay > closingDay) {
      closingMonth += 1;

      if (closingMonth > 12) {
        closingMonth = 1;
        closingYear += 1;
      }
    }

    let dueMonth = closingMonth;
    let dueYear = closingYear;

    if (dueDay <= closingDay) {
      dueMonth += 1;

      if (dueMonth > 12) {
        dueMonth = 1;
        dueYear += 1;
      }
    }

    const closingDate = new Date(Date.UTC(closingYear, closingMonth - 1, closingDay));
    const clampedDueDay = Math.min(dueDay, new Date(dueYear, dueMonth, 0).getDate());
    const dueDate = new Date(Date.UTC(dueYear, dueMonth - 1, clampedDueDay));

    return { closingDate, dueDate };
  }

  // Caminho inverso do acima: dado um vencimento já salvo (Data de uma despesa de cartão
  // em edição), reconstrói o fechamento correspondente — necessário pra saber se essa
  // fatura já fechou, sem reprocessar o vencimento como se fosse uma data de compra nova.
  private creditCardClosingDateFromDueDate(
    dueYear: number,
    dueMonth: number,
    closingDay: number,
    dueDay: number,
  ): Date {
    let closingMonth = dueMonth;
    let closingYear = dueYear;

    if (dueDay <= closingDay) {
      closingMonth -= 1;

      if (closingMonth < 1) {
        closingMonth = 12;
        closingYear -= 1;
      }
    }

    return new Date(Date.UTC(closingYear, closingMonth - 1, closingDay));
  }

  private resolveInitialTypeFromQueryParam(): TransactionType | null {
    const raw = this.route.snapshot.queryParamMap.get('type');
    return raw === 'Expense' || raw === 'Income' ? raw : null;
  }
}
