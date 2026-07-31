using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrueBalance.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReplaceAccountTypeWithColor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "type",
                table: "accounts",
                newName: "color");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "color",
                table: "accounts",
                newName: "type");
        }
    }
}
