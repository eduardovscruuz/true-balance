using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrueBalance.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactionInstallments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "installment_number",
                table: "transactions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "total_installments",
                table: "transactions",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "installment_number",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "total_installments",
                table: "transactions");
        }
    }
}
