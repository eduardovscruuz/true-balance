using TrueBalance.Domain.Enums;

namespace TrueBalance.Domain.Entities;

public class Transaction
{
    public Guid Id { get; set; }
    public Guid? AccountId { get; set; }
    public Guid? CreditCardId { get; set; }
    public Guid CategoryId { get; set; }
    public Guid? SubcategoryId { get; set; }
    public TransactionType Type { get; set; }
    public TransactionStatus Status { get; set; }
    public decimal Amount { get; set; }
    public string Description { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public bool IsFixed { get; set; }
    public string? InstallmentInfo { get; set; }
    public Guid? RecurrenceGroupId { get; set; }

    // Dia do mês (1-31) em que essa recorrência deveria cair — independente do dia
    // real desta ocorrência específica. Ex: salário recorre sempre no último dia do
    // mês (RecurrenceDay=31), mas uma ocorrência pode ter sido paga um dia antes
    // (Date=30) sem que isso mude o padrão de recorrência dos próximos meses.
    public int? RecurrenceDay { get; set; }

    // Só relevante quando IsFixed=true. Nula = repete indefinidamente (limitado só pela
    // janela rolante de projeção). Definida = o ProjectionService para de gerar novos
    // meses depois deste (inclusive) — ex: mensalidade de faculdade que acaba em dezembro.
    // Diferente de parcelas (InstallmentNumber/TotalInstallments): aqui o valor mensal
    // continua o mesmo, só a recorrência tem um fim marcado.
    public DateTime? RecurrenceEndDate { get; set; }

    // Compra parcelada com fim definido (ex: empréstimo em 30x), diferente de IsFixed
    // (que se repete indefinidamente). InstallmentNumber é a parcela atual desta
    // ocorrência; TotalInstallments é o total da série. O RecurrenceGroupId (mesmo
    // campo usado por transações fixas) liga as parcelas da mesma série, e o
    // ProjectionService gera as próximas até InstallmentNumber alcançar TotalInstallments.
    public int? InstallmentNumber { get; set; }
    public int? TotalInstallments { get; set; }

    public Account? Account { get; set; }
    public CreditCard? CreditCard { get; set; }
    public Category Category { get; set; } = null!;
    public Subcategory? Subcategory { get; set; }
}
