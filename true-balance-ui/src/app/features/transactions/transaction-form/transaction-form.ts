import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, combineLatest, map } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui-components/confirm-dialog/confirm-dialog';
import { computeCreditCardInvoice, creditCardClosingDateFromDueDate } from '../../../shared/utils/credit-card-invoice.util';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { CreateTransaction, Transaction, TransactionStatus, TransactionType } from '../../../core/models/transaction.model';
import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { resolveLucideIconName } from '../../../shared/utils/lucide-icon.util';
import { LucideAngularModule } from 'lucide-angular';

interface DescriptionSuggestion {
  description: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  subcategoryId: string | null;
  accountId: string | null;
  creditCardId: string | null;
  // "Cartão {nome}" quando é cartão, só o nome quando é conta — sem ícone, só texto.
  accountLabel: string;
}

@Component({
  selector: 'app-transaction-form',
  imports: [ReactiveFormsModule, CurrencyMaskDirective, CurrencyPipe, DatePipe, LucideAngularModule, ConfirmDialog],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.scss',
})
export class TransactionForm implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly formBuilder = inject(FormBuilder);

  // Substituem o que antes vinha de ActivatedRoute (query params type/source/creditCardId,
  // param :id) — assim este componente funciona tanto numa página roteada (o host lê a URL
  // e repassa pra cá) quanto dentro de um modal (o host passa direto, sem URL nenhuma
  // envolvida). Ver TransactionFormPage e TransactionFormModal.
  readonly transactionId = input<string | null>(null);
  readonly initialType = input<TransactionType | null>(null);
  readonly initialSource = input<'credit-card' | null>(null);
  readonly initialCreditCardId = input<string | null>(null);

  // Emitido depois de criar/atualizar OU excluir com sucesso — quem hospeda este formulário
  // decide o que fazer (a página navega pra /transactions; o modal se fecha). Reaproveitado
  // pra exclusão também: pro host, "salvou" e "excluiu" significam a mesma coisa — "terminei,
  // pode ir embora" — não precisa de um segundo output só pra isso.
  readonly saved = output<void>();

  private readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] });
  readonly accounts = toSignal(this.accountService.getAll(), { initialValue: [] });
  readonly creditCards = toSignal(this.creditCardService.getAll(), { initialValue: [] });
  private readonly subcategories = toSignal(this.subcategoryService.getAll(), { initialValue: [] });
  // Histórico completo, só pra alimentar as sugestões de autocompletar (ver
  // descriptionSuggestions) — nada aqui filtra por mês, precisa de tudo.
  private readonly allTransactions = toSignal(this.transactionService.getAll(), { initialValue: [] });

  readonly isEditMode = () => this.transactionId() !== null;

  // Preserva o RecurrenceGroupId original ao editar uma transação que já era fixa —
  // ver comentário completo em onSubmit().
  private originalRecurrenceGroupId: string | null = null;

  // PaidDate não é editável neste formulário (só a tela de Fatura pode setar isso) —
  // preserva o valor já salvo pra reenviar sem alterar, já que ApplyDto sobrescreve
  // com o que vier no dto (sem isso, editar uma compra de cartão já paga apagaria
  // silenciosamente a data de pagamento da fatura inteira).
  private loadedPaidDateIso: string | null = null;

  // Em edição, o tipo já foi decidido na criação e não faz mais sentido escolher de
  // novo — o título do formulário (ver formTitle) já indica "Editar Despesa"/"Editar
  // Receita" no lugar do toggle.
  readonly isTypeImplicit = computed(() => this.isEditMode() || this.initialType() !== null);

  // Vindo do botão "Cartão" (initialSource==='credit-card'), ou detectado ao carregar uma
  // transação existente que já tem CreditCardId em vez de AccountId (ver ngOnInit). Conta
  // e Cartão são mutuamente exclusivos no modelo (Transaction tem os dois campos
  // nulláveis), então o formulário mostra um seletor OU o outro, nunca os dois.
  //
  // Começa em false e é sincronizado por um effect() no construtor (não lido direto aqui
  // com "signal(this.initialSource() === 'credit-card')") de propósito: hospedado dentro
  // do modal, este componente é o NETO da árvore (app.html > TransactionFormModal >
  // TransactionForm) — nesse instante exato do inicializador de campo, o input ainda podia
  // não estar assentado, e um signal() comum nunca se corrige depois (fica travado no
  // valor errado pra sempre). Um effect() só roda depois que os inputs já estão
  // garantidamente resolvidos, então sempre pega o valor certo.
  readonly isCreditCardMode = signal(false);

  readonly formTitle = computed(() => {
    // Em modo cartão o título sempre segue o Tipo SELECIONADO (ver toggle
    // Despesa/Estorno no template), não o initialType estático — o botão único "Cartão"
    // (dashboard/header) não vem com tipo pré-definido, o usuário escolhe aqui dentro.
    if (this.isCreditCardMode()) {
      if (this.isEditMode()) {
        return this.selectedType() === 'Income' ? 'Editar Estorno de Cartão' : 'Editar Compra de Cartão';
      }
      return this.selectedType() === 'Income' ? 'Novo Estorno de Cartão' : 'Nova Compra de Cartão';
    }

    if (this.isEditMode()) {
      return this.selectedType() === 'Income' ? 'Editar Receita' : 'Editar Despesa';
    }

    if (this.initialType() === 'Expense') {
      return 'Nova Despesa';
    }

    if (this.initialType() === 'Income') {
      return 'Nova Receita';
    }

    return 'Nova Transação';
  });

  form = this.formBuilder.group({
    type: this.formBuilder.nonNullable.control<TransactionType>(this.initialType() ?? 'Expense', Validators.required),
    categoryId: this.formBuilder.nonNullable.control('', Validators.required),
    subcategoryId: this.formBuilder.nonNullable.control(''),
    accountId: this.formBuilder.nonNullable.control('', Validators.required),
    // Vindo do botão "Registrar Estorno" na tela de fatura (?creditCardId=...), que já
    // sabe em qual cartão o estorno deve entrar — poupa o usuário de selecionar de novo.
    creditCardId: this.formBuilder.nonNullable.control(this.initialCreditCardId() ?? ''),
    amount: this.formBuilder.control<number | null>(null, Validators.required),
    description: this.formBuilder.nonNullable.control('', Validators.required),
    date: this.formBuilder.nonNullable.control(this.todayAsInputValue(), Validators.required),
    // Só relevante em EDIÇÃO de compra de cartão — a data real da compra, independente
    // do vencimento da fatura (guardado em "date", nunca reprocessado aqui). Na criação,
    // o campo "Data da Compra" da tela usa "date" mesmo (ver onSubmit).
    purchaseDate: this.formBuilder.control<string | null>(null),
    // Só relevante na CRIAÇÃO de compra de cartão — mês ("yyyy-MM") da fatura em que a
    // compra deve cair. Começa sempre auto-preenchido com o mês calculado a partir da
    // data de compra + dia de fechamento do cartão (ver effect no construtor), mas o
    // usuário pode digitar outro mês pra forçar a compra numa fatura específica (ex:
    // já sabe que vai lançar atrasado e quer que caia na fatura seguinte mesmo assim).
    invoiceMonthOverride: this.formBuilder.control<string | null>(null),
    // Pendente por padrão. Pra compra de cartão, Status nem fica editável aqui — só
    // muda em bloco pela tela de Fatura (marcar fatura inteira como Paga/Pendente),
    // nunca por compra individual (ver efeito abaixo).
    status: this.formBuilder.nonNullable.control<TransactionStatus>('Pending', Validators.required),
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
    // Só relevante na CRIAÇÃO de uma compra parcelada — decide se o campo Valor abaixo
    // representa o total da compra (sistema divide pelas parcelas) ou já o valor de UMA
    // parcela (sistema usa direto, sem dividir). Útil quando você já sabe o valor exato
    // da parcela (ex: fatura anterior já mostrou 33,27) e não quer fazer a conta de cabeça.
    amountInputMode: this.formBuilder.nonNullable.control<'total' | 'perInstallment'>('total'),
  });

  // Combina as 4 chamadas de referência num só sinal de "já carregou" — se estiver
  // editando, some com o carregamento da própria transação (marcado em ngOnInit). Quem
  // hospeda este formulário (página ou modal) usa isso pra mostrar um estado de
  // carregamento até o form estar de fato pronto pra uso.
  private readonly dataReady = toSignal(
    combineLatest([
      this.categoryService.getAll(),
      this.accountService.getAll(),
      this.creditCardService.getAll(),
      this.subcategoryService.getAll(),
    ]).pipe(map(() => true)),
    { initialValue: false },
  );
  private readonly transactionLoaded = signal(false);
  readonly loading = computed(() => !this.dataReady() || (this.isEditMode() && !this.transactionLoaded()));

  // Reactive Forms nunca marca um controle como "dirty" por causa de patchValue()/
  // setValue() programático (usados pra popular o form, inclusive nos effects abaixo) —
  // só interação real do usuário pelo input/select ligado ao formControlName faz isso. Ou
  // seja, o form já nasce "limpo" e só fica dirty quando o usuário de fato mexe em algo;
  // não precisa de snapshot pra comparar, só expor o que o Angular já sabe como signal.
  readonly isDirty = toSignal(this.form.valueChanges.pipe(map(() => this.form.dirty)), { initialValue: false });

  readonly saving = signal(false);

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

  private readonly amountInputModeValue = toSignal(this.form.controls.amountInputMode.valueChanges, {
    initialValue: this.form.controls.amountInputMode.value,
  });

  // Quando parcelado NA CRIAÇÃO, o campo Valor pode representar o TOTAL da compra (padrão
  // — mais intuitivo quando você sabe o total, ex: 20 mil em 20x) ou já o valor de UMA
  // parcela (ver amountInputMode) — quando você já sabe exatamente quanto é a parcela (ex:
  // uma fatura anterior já mostrou o valor) e não quer calcular o total de cabeça. Em
  // EDIÇÃO, a parcela já existe com seu próprio valor guardado — Valor edita diretamente
  // essa parcela (ex: reajuste da mensalidade), não um total reconstruído, então nenhuma
  // das duas opções faz sentido, só "Valor" mesmo.
  readonly amountLabel = computed(() => {
    if (this.isEditMode() || !this.isInstallmentValue()) {
      return 'Valor';
    }

    return this.amountInputModeValue() === 'perInstallment' ? 'Valor da parcela' : 'Valor total';
  });

  // Dica visual espelhando o que foi digitado: se o campo é o total, mostra quanto fica
  // cada parcela; se o campo já é a parcela, mostra quanto fica o total — sempre a conta
  // que o usuário NÃO digitou diretamente.
  readonly installmentAmountPreview = computed(() => {
    if (!this.isInstallmentValue() || this.isEditMode()) {
      return null;
    }

    const amount = this.amountValue();
    const count = this.totalInstallmentsValue();

    if (amount === null || count === null || count <= 0) {
      return null;
    }

    return this.amountInputModeValue() === 'perInstallment' ? amount * count : amount / count;
  });

  readonly installmentAmountPreviewLabel = computed(() =>
    this.amountInputModeValue() === 'perInstallment' ? 'O valor total será de' : 'Cada parcela será de',
  );

  private readonly recurrenceEndDateValue = toSignal(this.form.controls.recurrenceEndDate.valueChanges, {
    initialValue: this.form.controls.recurrenceEndDate.value,
  });

  private readonly dateValue = toSignal(this.form.controls.date.valueChanges, {
    initialValue: this.form.controls.date.value,
  });

  private readonly purchaseDateValue = toSignal(this.form.controls.purchaseDate.valueChanges, {
    initialValue: this.form.controls.purchaseDate.value,
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

  readonly statusValue = toSignal(this.form.controls.status.valueChanges, {
    initialValue: this.form.controls.status.value,
  });

  private readonly invoiceMonthOverrideValue = toSignal(this.form.controls.invoiceMonthOverride.valueChanges, {
    initialValue: this.form.controls.invoiceMonthOverride.value,
  });

  // O cálculo "natural" (sem considerar override nenhum) — usado só pra manter o campo
  // Fatura auto-preenchido enquanto o usuário não mexeu nele (ver effect no construtor).
  // creditCardInvoiceInfo (abaixo) é que decide o valor final de verdade usado ao salvar.
  private readonly autoComputedDueDate = computed(() => {
    if (!this.isCreditCardMode() || this.isEditMode()) {
      return null;
    }

    const creditCard = this.creditCards().find((c) => c.id === this.selectedCreditCardId());

    if (!creditCard) {
      return null;
    }

    const [year, month, day] = this.dateValue().split('-').map(Number);
    const installmentMonthOffset =
      this.isInstallmentValue() && this.installmentNumberValue() ? this.installmentNumberValue()! - 1 : 0;

    return computeCreditCardInvoice(year, month, day, creditCard.closingDay, creditCard.dueDay, installmentMonthOffset)
      .dueDate;
  });

  // Uma compra no cartão pertence à fatura que fecha DEPOIS dela — se o dia da compra é
  // depois do fechamento do cartão, ela já perdeu a fatura deste mês e cai na do mês
  // SEGUINTE (que ainda nem fechou). Calculamos isso a partir da data de compra digitada
  // (ou, na criação, se o usuário forçou um mês no campo Fatura, usamos esse mês direto,
  // ignorando o cálculo); o vencimento resultante (não a data de compra) é o que vira a
  // Data salva da transação (ver onSubmit) — assim ela aparece agrupada no mês certo em
  // "Transações do Mês", e não no mês em que a compra foi fisicamente feita.
  //
  // Isso vale tanto pra CRIAÇÃO quanto pra EDIÇÃO de compra avulsa ou parcelada — mudar a
  // Data da Compra pode, sim, mover a compra pra outra fatura (ex: lançou atrasado, a
  // compra é na verdade do mês anterior). Só despesa FIXA foge disso: cada mês é um fato
  // novo (uma conta nova chegando), não existe "a" data de compra fazendo sentido de
  // reprocessar — ali só reconstruímos o fechamento a partir da Data já salva.
  private readonly creditCardInvoiceInfo = computed(() => {
    if (!this.isCreditCardMode()) {
      return null;
    }

    const creditCard = this.creditCards().find((c) => c.id === this.selectedCreditCardId());

    if (!creditCard) {
      return null;
    }

    if (this.isEditMode() && this.isFixedValue()) {
      const [year, month, day] = this.dateValue().split('-').map(Number);
      const closingDate = creditCardClosingDateFromDueDate(year, month, creditCard.closingDay, creditCard.dueDay);
      return { closingDate, dueDate: new Date(Date.UTC(year, month - 1, day)) };
    }

    if (this.isEditMode()) {
      const [year, month, day] = (this.purchaseDateValue() ?? this.dateValue()).split('-').map(Number);
      // Igual a "registrar diretamente a parcela N" na criação (ver comentário abaixo) —
      // a Data da Compra editada representa sempre a mesma compra original única, então o
      // deslocamento é relativo à parcela 1, não à parcela que está sendo editada agora.
      const installmentMonthOffset =
        this.isInstallmentValue() && this.installmentNumberValue() ? this.installmentNumberValue()! - 1 : 0;

      return computeCreditCardInvoice(
        year,
        month,
        day,
        creditCard.closingDay,
        creditCard.dueDay,
        installmentMonthOffset,
      );
    }

    const override = this.invoiceMonthOverrideValue();

    if (override) {
      const [overrideYear, overrideMonth] = override.split('-').map(Number);
      const clampedDueDay = Math.min(creditCard.dueDay, new Date(overrideYear, overrideMonth, 0).getDate());
      const dueDate = new Date(Date.UTC(overrideYear, overrideMonth - 1, clampedDueDay));
      const closingDate = creditCardClosingDateFromDueDate(
        overrideYear,
        overrideMonth,
        creditCard.closingDay,
        creditCard.dueDay,
      );
      return { closingDate, dueDate };
    }

    const [year, month, day] = this.dateValue().split('-').map(Number);
    // Registrar diretamente a parcela N de uma compra parcelada (ex: já vinha pagando em
    // outro controle e só passou a registrar a partir da 4ª parcela) precisa deslocar a
    // fatura pra frente pelas parcelas que já "venceram" antes desta — sem isso, o sistema
    // sempre calcula a fatura como se essa fosse a 1ª parcela da compra.
    const installmentMonthOffset =
      this.isInstallmentValue() && this.installmentNumberValue() ? this.installmentNumberValue()! - 1 : 0;

    return computeCreditCardInvoice(
      year,
      month,
      day,
      creditCard.closingDay,
      creditCard.dueDay,
      installmentMonthOffset,
    );
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

  // Null só em despesa FIXA editada — ali a Data já é o vencimento, não há nada novo pra
  // prever (ver creditCardInvoiceInfo). Nos demais casos (criação, ou edição de compra
  // avulsa/parcelada), é o vencimento recém-calculado que vai virar a Data salva (ver
  // onSubmit) — mostrado aqui como preview antes de salvar.
  readonly creditCardDueDatePreview = computed(() =>
    this.isEditMode() && this.isFixedValue() ? null : (this.creditCardInvoiceInfo()?.dueDate ?? null),
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

  private readonly descriptionValue = toSignal(this.form.controls.description.valueChanges, {
    initialValue: this.form.controls.description.value,
  });

  // Marca a sugestão que acabou de ser aceita — enquanto a Descrição continuar
  // exatamente igual a ela, não faz sentido reoferecer a mesma sugestão de novo.
  // Volta a null assim que o usuário digitar qualquer coisa diferente disso.
  private readonly lastAppliedSuggestionDescription = signal<string | null>(null);

  // Se o usuário decidiu não usar a sugestão (ex: vai completar a descrição com algo tipo
  // "30mg" no final), tirar o foco do campo tem que fechar a lista — sem isso ela ficava
  // sobrepondo os campos de baixo (Valor etc.) mesmo depois de ele já ter clicado noutro
  // lugar. Ao clicar numa sugestão, o botão usa (mousedown) com preventDefault (ver
  // template) em vez de (click) — isso evita que o navegador tire o foco do input ANTES do
  // clique ser processado (senão a lista já teria sumido e o clique nunca aplicaria nada).
  readonly descriptionFocused = signal(false);

  readonly showDescriptionSuggestions = computed(
    () => this.descriptionFocused() && this.descriptionSuggestions().length > 0,
  );

  // Sugere preencher Categoria/Subcategoria/Conta ou Cartão a partir do próprio
  // histórico — ex: toda vez que você lança "Gasolina", é sempre a mesma categoria e a
  // mesma conta, só o valor muda. Nunca sugere Valor nem Data (isso sim varia de vez em
  // vez). Só na CRIAÇÃO — em edição a transação já tem os campos preenchidos.
  readonly descriptionSuggestions = computed<DescriptionSuggestion[]>(() => {
    if (this.isEditMode()) {
      return [];
    }

    const typed = this.descriptionValue().trim();

    if (typed.length < 2 || typed === this.lastAppliedSuggestionDescription()) {
      return [];
    }

    const type = this.selectedType();
    const cardMode = this.isCreditCardMode();
    const search = typed.toLowerCase();

    const matches = this.allTransactions().filter((t) => {
      if (t.type !== type) {
        return false;
      }

      if (cardMode ? t.creditCardId === null : t.accountId === null) {
        return false;
      }

      return t.description.toLowerCase().includes(search);
    });

    // Uma sugestão por descrição única — a ocorrência mais RECENTE de cada uma é quem
    // representa a categoria/conta "atual" (a mais provável de ainda valer hoje).
    const mostRecentByDescription = new Map<string, (typeof matches)[number]>();

    for (const transaction of matches) {
      const key = transaction.description.toLowerCase();
      const existing = mostRecentByDescription.get(key);

      if (!existing || transaction.date > existing.date) {
        mostRecentByDescription.set(key, transaction);
      }
    }

    const categoryById = new Map(this.categories().map((c) => [c.id, c]));
    const subcategoryById = new Map(this.subcategories().map((s) => [s.id, s]));
    const accountById = new Map(this.accounts().map((a) => [a.id, a]));
    const creditCardById = new Map(this.creditCards().map((c) => [c.id, c]));

    return [...mostRecentByDescription.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map((transaction) => {
        const category = categoryById.get(transaction.categoryId);
        const subcategory = transaction.subcategoryId ? subcategoryById.get(transaction.subcategoryId) : undefined;
        const accountLabel = cardMode
          ? `Cartão ${creditCardById.get(transaction.creditCardId!)?.name ?? '—'}`
          : (accountById.get(transaction.accountId!)?.name ?? '—');

        return {
          description: transaction.description,
          categoryId: transaction.categoryId,
          categoryName: subcategory?.name ?? category?.name ?? '—',
          categoryColor: category?.color ?? null,
          categoryIcon: category?.icon ?? null,
          subcategoryId: transaction.subcategoryId,
          accountId: transaction.accountId,
          creditCardId: transaction.creditCardId,
          accountLabel,
        };
      });
  });

  readonly resolveIconName = resolveLucideIconName;

  applySuggestion(suggestion: DescriptionSuggestion): void {
    this.form.patchValue({
      description: suggestion.description,
      categoryId: suggestion.categoryId,
      subcategoryId: suggestion.subcategoryId ?? '',
      accountId: suggestion.accountId ?? '',
      creditCardId: suggestion.creditCardId ?? '',
    });

    this.lastAppliedSuggestionDescription.set(suggestion.description);
  }

  constructor() {
    // Sincroniza isCreditCardMode a partir do input assim que ele estiver garantidamente
    // resolvido (ver comentário na declaração do signal acima). Só roda de novo se
    // initialSource() mudar — o que nunca acontece depois da criação —, então nunca
    // sobrescreve o `.set()` de edição (ngOnInit), que roda bem depois.
    effect(() => {
      this.isCreditCardMode.set(this.initialSource() === 'credit-card');
    });

    // Mantém o campo Fatura acompanhando o cálculo automático enquanto o usuário não
    // mexeu nele diretamente (control.pristine — setValue() nunca marca dirty, só
    // interação real do usuário via input marca). No instante em que ele edita o mês na
    // mão, o controle vira dirty e este effect para de sobrescrever — a partir daí é o
    // usuário quem manda, não o cálculo automático.
    effect(() => {
      const autoDate = this.autoComputedDueDate();
      const control = this.form.controls.invoiceMonthOverride;

      if (autoDate && control.pristine) {
        const month = `${autoDate.getUTCFullYear()}-${String(autoDate.getUTCMonth() + 1).padStart(2, '0')}`;

        if (control.value !== month) {
          control.setValue(month);
        }
      }
    });

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

    // Status de compra de cartão nunca é editável por transação individual — só muda em
    // bloco pela tela de Fatura (ver credit-card-invoice), que já mantém a fatura inteira
    // atômica (paga ou não, nunca "meio paga"). Editar isso aqui, item por item, quebraria
    // essa garantia. Pra transação comum, Status continua livre, como sempre foi.
    effect(() => {
      const control = this.form.controls.status;

      if (this.isCreditCardMode()) {
        if (control.enabled) {
          control.disable({ emitEvent: false });
        }
      } else if (control.disabled) {
        control.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const id = this.transactionId();

    if (id === null) {
      return;
    }

    this.transactionService.getById(id).subscribe((transaction) => {
      this.originalRecurrenceGroupId = transaction.recurrenceGroupId;
      this.loadedPaidDateIso = transaction.paidDate;

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
        // Fallback pro vencimento em itens de cartão criados antes desse campo existir —
        // não é o dia real da compra, mas é a melhor aproximação disponível pra eles.
        purchaseDate: transaction.purchaseDate
          ? this.isoToInputValue(transaction.purchaseDate)
          : transaction.creditCardId
            ? this.isoToInputValue(transaction.date)
            : null,
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
      this.transactionLoaded.set(true);
    });
  }

  // "Salvar e criar outro" só faz sentido na CRIAÇÃO (nunca em edição) — pensado pro
  // fluxo de lançar várias compras da mesma fatura em sequência, sem sair do formulário
  // a cada uma. Mantém Cartão/Conta/Tipo (o contexto do lote) e limpa o resto.
  saveAndCreateAnother(): void {
    this.onSubmit('createAnother');
  }

  onSubmit(afterSave: 'navigate' | 'createAnother' = 'navigate'): void {
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
      purchaseDate,
      status,
      isFixed,
      recurrenceDay,
      recurrenceEndDate,
      isInstallment,
      installmentNumber,
      totalInstallments,
      amountInputMode,
    } = this.form.getRawValue();

    // Se já era fixa/parcelada (tinha um RecurrenceGroupId) e continua sendo, preserva o
    // mesmo grupo — gerar um novo aqui faria o ProjectionService tratar isso como uma série
    // nova e duplicar as projeções futuras ao lado das que já existem sob o grupo antigo.
    // Só gera um grupo novo se a transação está virando fixa/parcelada agora pela primeira vez.
    const recurrenceGroupId =
      isFixed || isInstallment ? (this.originalRecurrenceGroupId ?? crypto.randomUUID()) : null;

    // Quando parcelado NA CRIAÇÃO, o Valor digitado é o TOTAL (divide pelas parcelas,
    // arredondado pra centavos) ou já o valor de UMA parcela (usa direto, sem dividir) —
    // depende do que foi escolhido em amountInputMode (ver amountLabel). Em EDIÇÃO, o
    // Valor já edita diretamente esta parcela — nenhuma das duas contas se aplica.
    const amountToSave =
      isInstallment && !this.isEditMode() && amount !== null && totalInstallments
        ? amountInputMode === 'perInstallment'
          ? amount
          : Math.round((amount / totalInstallments) * 100) / 100
        : (amount ?? 0);

    // Numa despesa de cartão NOVA, o que é salvo como Data é o VENCIMENTO da fatura em
    // que a compra cai, não a data de compra digitada — é assim que ela aparece agrupada
    // no mês certo em "Transações do Mês" (ex: compra feita depois do fechamento cai no
    // mês seguinte). Em edição, a Data já é o vencimento, não recalcula.
    const creditCardDueDate = this.creditCardDueDatePreview();
    const dateIso = creditCardDueDate ? creditCardDueDate.toISOString() : `${date}T00:00:00Z`;

    // Data da Compra: na CRIAÇÃO de despesa de cartão, é o mesmo valor digitado no campo
    // "Data da Compra" (que também alimenta o cálculo do vencimento acima). Em EDIÇÃO, é
    // um campo independente (purchaseDate), que não mexe no vencimento já salvo. Pra
    // transação comum, não existe — Date já é o dia real.
    const purchaseDateIso = this.isCreditCardMode()
      ? this.isEditMode()
        ? purchaseDate
          ? `${purchaseDate}T00:00:00Z`
          : null
        : `${date}T00:00:00Z`
      : null;

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
      // PaidDate não é editável aqui — só a tela de Fatura pode definir isso (ver
      // SetInvoiceStatusAsync), então nunca é enviado por este formulário. Em edição,
      // isso preserva o valor já salvo no backend (ApplyDto só sobrescreve o que vier
      // no dto — como aqui sempre vai null, precisa reenviar o valor atual pra não apagar).
      paidDate: this.loadedPaidDateIso,
      purchaseDate: purchaseDateIso,
    };

    const id = this.transactionId();

    if (id === null) {
      this.saving.set(true);
      this.transactionService.create(dto).subscribe({
        next: () => {
          this.saving.set(false);

          if (afterSave === 'createAnother') {
            this.resetFormForNextEntry();
          } else {
            this.saved.emit();
          }
        },
        error: () => this.saving.set(false),
      });
      return;
    }

    // Editando uma ocorrência que já fazia parte de uma série (fixa ou parcelada):
    // pergunta se a mudança vale só pra esta ocorrência ou pra ela e todas as próximas
    // PENDENTES também — ex: reajuste de mensalidade que deve valer daqui pra frente,
    // vs. um pagamento atrasado com valor diferente que não deve afetar os próximos meses.
    const isPartOfSeries = this.originalRecurrenceGroupId !== null && (isFixed || isInstallment);

    if (!isPartOfSeries) {
      this.saving.set(true);
      this.transactionService.update(id, dto).subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: () => this.saving.set(false),
      });
      return;
    }

    // Pergunta ao usuário (ver ConfirmDialog no template) em vez de decidir aqui — a
    // resposta chega depois, por um dos 3 métodos abaixo (confirmSeriesUpdate.../
    // cancelSeriesUpdate), então este método termina aqui sem salvar nada ainda.
    this.pendingSeriesUpdate.set({ id, dto });
  }

  // Três caminhos possíveis pra edição de uma ocorrência que já faz parte de uma série
  // (ver ConfirmDialog no template, disparado quando pendingSeriesUpdate() tem valor):
  // cancelar de vez (não salva nada — antes não existia essa opção de fato: o "Cancelar"
  // do confirm() nativo do navegador, sem querer, tinha o mesmo efeito de "só esta"),
  // salvar só esta ocorrência, ou salvar esta e as próximas PENDENTES da série.
  readonly pendingSeriesUpdate = signal<{ id: string; dto: CreateTransaction } | null>(null);

  cancelSeriesUpdate(): void {
    this.pendingSeriesUpdate.set(null);
  }

  confirmSeriesUpdateOnlyThis(): void {
    this.resolveSeriesUpdate((id, dto) => this.transactionService.update(id, dto));
  }

  confirmSeriesUpdateWholeSeries(): void {
    this.resolveSeriesUpdate((id, dto) => this.transactionService.updateSeries(id, dto));
  }

  private resolveSeriesUpdate(request: (id: string, dto: CreateTransaction) => Observable<Transaction>): void {
    const pending = this.pendingSeriesUpdate();

    if (!pending) {
      return;
    }

    this.pendingSeriesUpdate.set(null);
    this.saving.set(true);
    request(pending.id, pending.dto).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: () => this.saving.set(false),
    });
  }

  // Botão "Excluir" só existe em edição — a página de edição desenha o botão, e o modal
  // de edição também (ver TransactionFormModal). Termina emitindo "saved" igual um
  // salvamento normal — ver comentário no output.
  deleteTransaction(): void {
    const id = this.transactionId();

    if (id === null) {
      return;
    }

    const description = this.form.controls.description.value;
    const recurrenceGroupId = this.originalRecurrenceGroupId;

    // Transação avulsa (sem série): confirmação simples de sempre.
    if (recurrenceGroupId === null) {
      if (!confirm(`Excluir a transação "${description}"? Essa ação não pode ser desfeita.`)) {
        return;
      }

      this.transactionService.delete(id).subscribe(() => this.saved.emit());
      return;
    }

    // Faz parte de uma série (fixa ou parcelada): oferece excluir só esta ocorrência ou
    // esta e todas as próximas pendentes da série (as já pagas nunca são afetadas).
    const deleteWholeSeries = confirm(
      `"${description}" faz parte de uma recorrência (fixa ou parcelada).\n\n` +
        `Clique OK para excluir esta e todas as próximas ocorrências PENDENTES da série.\n` +
        `Clique Cancelar para excluir só esta ocorrência.`,
    );

    if (deleteWholeSeries) {
      this.transactionService.deleteSeries(id).subscribe(() => this.saved.emit());
      return;
    }

    if (!confirm(`Excluir apenas esta ocorrência de "${description}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    this.transactionService.delete(id).subscribe(() => this.saved.emit());
  }

  // Preserva Cartão/Conta/Tipo (o contexto do lote que está sendo lançado) e limpa o
  // resto pra próxima compra — description/valor/categoria/data raramente se repetem
  // de uma compra pra outra dentro da mesma fatura.
  private resetFormForNextEntry(): void {
    this.form.reset({
      type: this.form.controls.type.value,
      categoryId: '',
      subcategoryId: '',
      accountId: this.form.controls.accountId.value,
      creditCardId: this.form.controls.creditCardId.value,
      amount: null,
      description: '',
      date: this.todayAsInputValue(),
      purchaseDate: null,
      status: 'Pending',
      isFixed: false,
      recurrenceDay: null,
      recurrenceEndDate: null,
      isInstallment: false,
      installmentNumber: null,
      totalInstallments: null,
      amountInputMode: 'total',
    });

    document.getElementById('description')?.focus();
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

}
