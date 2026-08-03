// Badge "gordinho", cantos pouco arredondados, maiúsculo, borda fina na cor do texto —
// usado pra status de pagamento em vários lugares (Fatura do Cartão, Transações do Mês,
// Resumo do Mês no Dashboard). Centralizado aqui pra não os três lugares saírem do padrão
// um do outro com o tempo. Largura fixa (comporta o texto mais longo, "Pago em atraso")
// com o texto centralizado — todo badge fica do mesmo tamanho, não só do tamanho do texto.
export const STATUS_BADGE_BASE_CLASS =
  'inline-flex items-center justify-center w-36 px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase border';

export const STATUS_BADGE_CLASS: Record<'Paid' | 'Pending', string> = {
  Paid: 'bg-green-50 text-green-700 border-green-700',
  Pending: 'bg-amber-50 text-amber-700 border-amber-700',
};

// Early = paga num mês-calendário anterior ao mês de vencimento da fatura, mesmo que já
// dentro da janela de pagamento dela (ex: fatura de agosto que fecha em julho e é paga
// ainda em julho — adiantada, mesmo já "aberta" pra pagamento). OnTime = paga no próprio
// mês de vencimento, até a data de vencimento. Late = paga depois da data de vencimento.
export type PaymentTiming = 'Early' | 'OnTime' | 'Late';

export const PAYMENT_TIMING_LABEL: Record<PaymentTiming, string> = {
  Early: 'Pago adiantado',
  OnTime: 'Pago',
  Late: 'Pago em atraso',
};

export const PAYMENT_TIMING_BADGE_CLASS: Record<PaymentTiming, string> = {
  Early: 'bg-blue-50 text-blue-700 border-blue-700',
  OnTime: 'bg-green-50 text-green-700 border-green-700',
  Late: 'bg-amber-50 text-amber-700 border-amber-700',
};

export function computePaymentTiming(paidDateIso: string, dueDateIso: string): PaymentTiming {
  const paidDate = new Date(paidDateIso);
  const dueDate = new Date(dueDateIso);
  const paidMonthIndex = paidDate.getUTCFullYear() * 12 + paidDate.getUTCMonth();
  const dueMonthIndex = dueDate.getUTCFullYear() * 12 + dueDate.getUTCMonth();

  // Paga num mês-calendário anterior ao do vencimento — adiantada mesmo se já dentro
  // da janela de pagamento da fatura (ex: fatura de agosto fechada e paga em julho).
  if (paidMonthIndex < dueMonthIndex) {
    return 'Early';
  }

  return paidDate.getTime() <= dueDate.getTime() ? 'OnTime' : 'Late';
}
