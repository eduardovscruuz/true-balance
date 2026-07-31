namespace TrueBalance.Domain.Entities;

public class CreditCard
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int ClosingDay { get; set; }
    public int DueDay { get; set; }
    public decimal Limit { get; set; }

    // Igual Category (Color/Icon) — usado pra mostrar um "selo" colorido representando o
    // cartão na coluna Categoria de "Transações do Mês", já que a fatura ali é agrupada
    // (não tem uma única categoria própria, cada compra dentro dela mantém a sua real).
    // Nulos pra cartões cadastrados antes desse campo existir (cai no ícone genérico).
    public string? Color { get; set; }
    public string? Icon { get; set; }

    // Conta de onde a fatura sai quando é paga — sem esse vínculo, as compras no cartão
    // ficam invisíveis pro fluxo de caixa/projeção de saldo de qualquer conta, mesmo
    // sendo um gasto real que vai sair dali no dia do vencimento.
    public Guid? PaymentAccountId { get; set; }

    public Account? PaymentAccount { get; set; }
    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}
