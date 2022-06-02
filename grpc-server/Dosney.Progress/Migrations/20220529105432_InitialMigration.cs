using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dosney.Progress.Migrations
{
    public partial class InitialMigration : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "progress_sessions",
                columns: table => new
                {
                    session_id = table.Column<string>(type: "text", nullable: false),
                    video_id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    progress_from = table.Column<long>(type: "bigint", nullable: false),
                    progress_to = table.Column<long>(type: "bigint", nullable: false),
                    timestamp_from = table.Column<long>(type: "bigint", nullable: false),
                    timestamp_to = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_progress_sessions", x => x.session_id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_progress_sessions_user_id",
                table: "progress_sessions",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_progress_sessions_video_id",
                table: "progress_sessions",
                column: "video_id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "progress_sessions");
        }
    }
}
