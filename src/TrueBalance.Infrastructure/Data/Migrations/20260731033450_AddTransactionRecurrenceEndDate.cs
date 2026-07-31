using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrueBalance.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactionRecurrenceEndDate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "recurrence_end_date",
                table: "transactions",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "recurrence_end_date",
                table: "transactions");
        }
    }
}
