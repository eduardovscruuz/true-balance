using Microsoft.EntityFrameworkCore;
using TrueBalance.Application.Interfaces;
using TrueBalance.Domain.Entities;
using TrueBalance.Domain.Enums;
using TrueBalance.Infrastructure.Data;

namespace TrueBalance.Infrastructure.Services;

public class ProjectionService : IProjectionService
{
    private const int ProjectionWindowMonths = 24;

    private readonly AppDbContext _context;

    public ProjectionService(AppDbContext context)
    {
        _context = context;
    }

    public async Task ProjectFixedExpensesAsync(CancellationToken stoppingToken)
    {
        var fixedTransactions = await _context.Transactions
            .Where(t => t.IsFixed && t.RecurrenceGroupId != null)
            .ToListAsync(stoppingToken);

        // Início do mês corrente + N meses, não "agora + N meses" — senão o mês limite
        // fica cortado no dia-do-mês em que o worker rodou (ex: worker roda todo dia 3,
        // deadline vira "3 de agosto/2028", e qualquer recorrência com dia > 3 nesse mês
        // — a esmagadora maioria — não é gerada, mesmo estando dentro da janela de 24
        // meses). Usando o início do mês seguinte ao 24º como limite, o mês inteiro (do
        // dia 1 ao último dia) fica coberto, batendo com a janela por MÊS-CALENDÁRIO que
        // o front-end assume (ver MonthSelectionService.maxMonthKey).
        var currentMonthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var deadline = currentMonthStart.AddMonths(ProjectionWindowMonths + 1);
        var newTransactions = new List<Transaction>();

        var groups = fixedTransactions.GroupBy(t => t.RecurrenceGroupId);

        foreach (var group in groups)
        {
            // A "âncora" é a primeira ocorrência do grupo (a que o usuário criou de fato,
            // ex: salário no dia 31). O DIA de referência pra gerar os próximos meses vem
            // de RecurrenceDay, não de anchor.Date.Day — porque o usuário pode editar essa
            // ocorrência específica (ex: recebeu um dia antes, ajusta Date pra refletir
            // isso) sem que o PADRÃO de recorrência mude junto. RecurrenceDay é nulo só em
            // dados legados (anteriores a esse campo existir), caiu no fallback nesse caso.
            //
            // Também evitamos encadear DateTime.AddMonths(1) sobre a última data gerada:
            // isso tem um bug conhecido — ao cair num mês mais curto (ex: 31 -> 30 em
            // setembro), o .NET "clampa" o dia pra 30 e esse 30 vira permanente, nunca mais
            // volta a ser 31 mesmo em meses de 31 dias. Recalculando sempre a partir do dia
            // de referência fixo, cada mês futuro usa min(diaFixo, diasNoMêsAlvo), que se
            // autocorrige: outubro corretamente volta a ser dia 31.
            var anchor = group.OrderBy(t => t.Date).First();
            var lastTransaction = group.OrderByDescending(t => t.Date).First();
            var recurrenceDay = anchor.RecurrenceDay ?? anchor.Date.Day;

            // Fim da recorrência (ex: mensalidade de faculdade que acaba em dezembro) vem
            // da ÚLTIMA ocorrência, não da âncora — igual a Amount/Description/etc acima,
            // assim editar essa data na ocorrência mais recente já vale pras próximas
            // gerações. Comparado por "chave de mês" (ano*12+mês), não pela data exata,
            // já que RecurrenceEndDate guarda só o mês-limite (o dia é irrelevante).
            var recurrenceEndMonthKey = lastTransaction.RecurrenceEndDate.HasValue
                ? ToMonthKey(lastTransaction.RecurrenceEndDate.Value)
                : (int?)null;

            var monthsAhead = MonthsBetween(anchor.Date, lastTransaction.Date) + 1;
            var nextDate = AddMonthsClampToDay(anchor.Date, recurrenceDay, monthsAhead);

            while (nextDate < deadline && (recurrenceEndMonthKey is null || ToMonthKey(nextDate) <= recurrenceEndMonthKey))
            {
                newTransactions.Add(new Transaction
                {
                    Id = Guid.NewGuid(),
                    AccountId = lastTransaction.AccountId,
                    CreditCardId = lastTransaction.CreditCardId,
                    CategoryId = lastTransaction.CategoryId,
                    SubcategoryId = lastTransaction.SubcategoryId,
                    Type = lastTransaction.Type,
                    Status = TransactionStatus.Pending,
                    Amount = lastTransaction.Amount,
                    Description = lastTransaction.Description,
                    Date = nextDate,
                    IsFixed = true,
                    InstallmentInfo = lastTransaction.InstallmentInfo,
                    RecurrenceGroupId = lastTransaction.RecurrenceGroupId,
                    RecurrenceDay = recurrenceDay,
                    RecurrenceEndDate = lastTransaction.RecurrenceEndDate
                });

                monthsAhead++;
                nextDate = AddMonthsClampToDay(anchor.Date, recurrenceDay, monthsAhead);
            }
        }

        // Compras parceladas (ex: empréstimo em 30x) usam o mesmo RecurrenceGroupId pra
        // ligar as parcelas, mas IsFixed fica false — elas têm fim definido (TotalInstallments),
        // diferente da recorrência indefinida das despesas fixas acima. Em vez de gerar até o
        // fim da janela de projeção, para assim que InstallmentNumber alcança TotalInstallments.
        var installmentTransactions = await _context.Transactions
            .Where(t => t.TotalInstallments != null && t.RecurrenceGroupId != null)
            .ToListAsync(stoppingToken);

        var installmentGroups = installmentTransactions.GroupBy(t => t.RecurrenceGroupId);

        foreach (var group in installmentGroups)
        {
            var anchor = group.OrderBy(t => t.Date).First();
            var lastTransaction = group.OrderByDescending(t => t.InstallmentNumber).First();
            var recurrenceDay = anchor.RecurrenceDay ?? anchor.Date.Day;
            var totalInstallments = lastTransaction.TotalInstallments!.Value;

            var monthsAhead = MonthsBetween(anchor.Date, lastTransaction.Date) + 1;
            var nextInstallmentNumber = lastTransaction.InstallmentNumber!.Value + 1;
            var nextDate = AddMonthsClampToDay(anchor.Date, recurrenceDay, monthsAhead);

            while (nextInstallmentNumber <= totalInstallments && nextDate < deadline)
            {
                newTransactions.Add(new Transaction
                {
                    Id = Guid.NewGuid(),
                    AccountId = lastTransaction.AccountId,
                    CreditCardId = lastTransaction.CreditCardId,
                    CategoryId = lastTransaction.CategoryId,
                    SubcategoryId = lastTransaction.SubcategoryId,
                    Type = lastTransaction.Type,
                    Status = TransactionStatus.Pending,
                    Amount = lastTransaction.Amount,
                    Description = lastTransaction.Description,
                    Date = nextDate,
                    IsFixed = false,
                    RecurrenceGroupId = lastTransaction.RecurrenceGroupId,
                    RecurrenceDay = recurrenceDay,
                    InstallmentNumber = nextInstallmentNumber,
                    TotalInstallments = totalInstallments
                });

                monthsAhead++;
                nextInstallmentNumber++;
                nextDate = AddMonthsClampToDay(anchor.Date, recurrenceDay, monthsAhead);
            }
        }

        if (newTransactions.Count == 0)
        {
            return;
        }

        _context.Transactions.AddRange(newTransactions);
        await _context.SaveChangesAsync(stoppingToken);
    }

    private static int MonthsBetween(DateTime from, DateTime to) =>
        ((to.Year - from.Year) * 12) + (to.Month - from.Month);

    private static int ToMonthKey(DateTime date) => (date.Year * 12) + date.Month;

    private static DateTime AddMonthsClampToDay(DateTime anchor, int targetDay, int monthsToAdd)
    {
        var totalMonths = (anchor.Year * 12) + (anchor.Month - 1) + monthsToAdd;
        var year = totalMonths / 12;
        var month = (totalMonths % 12) + 1;
        var day = Math.Min(targetDay, DateTime.DaysInMonth(year, month));

        return new DateTime(year, month, day, anchor.Hour, anchor.Minute, anchor.Second, anchor.Kind);
    }
}
