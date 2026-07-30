using Microsoft.EntityFrameworkCore;
using TrueBalance.Domain.Entities;

namespace TrueBalance.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<CreditCard> CreditCards => Set<CreditCard>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Subcategory> Subcategories => Set<Subcategory>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<MonthlySummary> MonthlySummaries => Set<MonthlySummary>();
    public DbSet<MonthlyBalance> MonthlyBalances => Set<MonthlyBalance>();

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder.UseSnakeCaseNamingConvention();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Account>(entity =>
        {
            entity.Property(a => a.Balance).HasPrecision(18, 2);
        });

        modelBuilder.Entity<CreditCard>(entity =>
        {
            entity.Property(c => c.Limit).HasPrecision(18, 2);
        });

        modelBuilder.Entity<Subcategory>(entity =>
        {
            entity.HasOne(s => s.Category)
                .WithMany(c => c.Subcategories)
                .HasForeignKey(s => s.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.Property(t => t.Amount).HasPrecision(18, 2);

            entity.HasOne(t => t.Account)
                .WithMany(a => a.Transactions)
                .HasForeignKey(t => t.AccountId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.CreditCard)
                .WithMany(c => c.Transactions)
                .HasForeignKey(t => t.CreditCardId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.Category)
                .WithMany(c => c.Transactions)
                .HasForeignKey(t => t.CategoryId)
                .IsRequired()
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.Subcategory)
                .WithMany(s => s.Transactions)
                .HasForeignKey(t => t.SubcategoryId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MonthlySummary>(entity =>
        {
            entity.Property(m => m.TotalAmount).HasPrecision(18, 2);

            entity.HasOne(m => m.Category)
                .WithMany(c => c.MonthlySummaries)
                .HasForeignKey(m => m.CategoryId)
                .IsRequired()
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(m => m.Subcategory)
                .WithMany(s => s.MonthlySummaries)
                .HasForeignKey(m => m.SubcategoryId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MonthlyBalance>(entity =>
        {
            entity.Property(m => m.ClosingBalance).HasPrecision(18, 2);

            entity.HasOne(m => m.Account)
                .WithMany(a => a.MonthlyBalances)
                .HasForeignKey(m => m.AccountId)
                .IsRequired()
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
