// Matemática de fatura de cartão, compartilhada entre TransactionForm (formulário de
// compra) e CreditCardList (cards com o resumo da fatura atual) — extraída pra um lugar
// só depois da 2ª vez que essa lógica precisou ser reescrita, pra não arriscar as duas
// cópias divergirem silenciosamente (foi exatamente esse tipo de divergência entre
// front-end e back-end que já causou um bug real nesta sessão).

// Dada uma data de COMPRA, determina em qual fatura ela cai: se o dia da compra é depois
// do fechamento do cartão, a fatura fecha no mês seguinte (perdeu a deste mês). O
// vencimento fica no mesmo mês do fechamento se dueDay > closingDay (venceu antes do
// próximo fechamento), senão no mês seguinte ao fechamento.
//
// installmentMonthOffset desloca esse resultado N meses pra frente — usado quando o
// usuário registra diretamente a parcela N (não a 1ª) de uma compra parcelada: a data de
// compra digitada continua sendo a da compra original (1ª parcela), mas ESTA ocorrência
// específica vence N-1 meses depois dela. Também serve pra "qual fatura fecha/vence antes
// ou depois de hoje" (ver CreditCardList), passando um offset negativo.
export function computeCreditCardInvoice(
  purchaseYear: number,
  purchaseMonth: number,
  purchaseDay: number,
  closingDay: number,
  dueDay: number,
  installmentMonthOffset = 0,
): { closingDate: Date; dueDate: Date } {
  // Índice absoluto de mês (ano*12 + mês, 0-based) evita loops manuais de overflow pra
  // somar meses — tanto no cálculo normal quanto no deslocamento de parcela.
  let closingMonthIndex = purchaseYear * 12 + (purchaseMonth - 1);

  if (purchaseDay > closingDay) {
    closingMonthIndex += 1;
  }

  closingMonthIndex += installmentMonthOffset;

  let dueMonthIndex = closingMonthIndex;

  if (dueDay <= closingDay) {
    dueMonthIndex += 1;
  }

  const closingYear = Math.floor(closingMonthIndex / 12);
  const closingMonth = (closingMonthIndex % 12) + 1;
  const dueYear = Math.floor(dueMonthIndex / 12);
  const dueMonth = (dueMonthIndex % 12) + 1;

  const closingDate = new Date(Date.UTC(closingYear, closingMonth - 1, closingDay));
  const clampedDueDay = Math.min(dueDay, new Date(dueYear, dueMonth, 0).getDate());
  const dueDate = new Date(Date.UTC(dueYear, dueMonth - 1, clampedDueDay));

  return { closingDate, dueDate };
}

// Caminho inverso do acima: dado um vencimento já conhecido (Date de uma transação de
// cartão), reconstrói o fechamento correspondente — necessário pra saber se essa fatura
// já fechou, sem reprocessar o vencimento como se fosse uma data de compra nova.
export function creditCardClosingDateFromDueDate(
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
