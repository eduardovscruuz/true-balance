using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrueBalance.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCreditCardColorIcon : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "color",
                table: "credit_cards",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "icon",
                table: "credit_cards",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "color",
                table: "credit_cards");

            migrationBuilder.DropColumn(
                name: "icon",
                table: "credit_cards");
        }
    }
}
