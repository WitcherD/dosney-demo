using Microsoft.EntityFrameworkCore;

namespace Dosney.Progress.Database;

public class ProgressDbContext : DbContext
{
    public ProgressDbContext(DbContextOptions<ProgressDbContext> contextOptions): base(contextOptions)
    {
    }

    public DbSet<ProgressSession> ProgressSessions { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        => optionsBuilder.UseSnakeCaseNamingConvention();
}