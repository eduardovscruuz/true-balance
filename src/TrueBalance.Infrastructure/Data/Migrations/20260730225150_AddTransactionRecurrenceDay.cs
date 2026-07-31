using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrueBalance.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactionRecurrenceDay : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "recurrence_day",
                table: "transactions",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "recurrence_day",
                table: "transactions");
        }
    }
}
