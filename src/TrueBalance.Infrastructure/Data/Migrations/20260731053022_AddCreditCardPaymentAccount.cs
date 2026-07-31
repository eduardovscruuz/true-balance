using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrueBalance.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCreditCardPaymentAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "payment_account_id",
                table: "credit_cards",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_credit_cards_payment_account_id",
                table: "credit_cards",
                column: "payment_account_id");

            migrationBuilder.AddForeignKey(
                name: "fk_credit_cards_accounts_payment_account_id",
                table: "credit_cards",
                column: "payment_account_id",
                principalTable: "accounts",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_credit_cards_accounts_payment_account_id",
                table: "credit_cards");

            migrationBuilder.DropIndex(
                name: "ix_credit_cards_payment_account_id",
                table: "credit_cards");

            migrationBuilder.DropColumn(
                name: "payment_account_id",
                table: "credit_cards");
        }
    }
}
