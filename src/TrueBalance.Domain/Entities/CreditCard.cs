namespace TrueBalance.Domain.Entities;

public class CreditCard
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int ClosingDay { get; set; }
    public int DueDay { get; set; }
    public decimal Limit { get; set; }

    // Conta de onde a fatura sai quando é paga — sem esse vínculo, as compras no cartão
    // ficam invisíveis pro fluxo de caixa/projeção de saldo de qualquer conta, mesmo
    // sendo um gasto real que vai sair dali no dia do vencimento.
    public Guid? PaymentAccountId { get; set; }

    public Account? PaymentAccount { get; set; }
    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}
