using System.Net;
using Confluent.Kafka;
using Confluent.SchemaRegistry;
using Confluent.SchemaRegistry.Serdes;
using Dosney.Progress.Database;
using Dosney.Progress.Kafka;
using Dosney.Progress.Migrations;
using Dosney.Progress.Services;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);
if (args.Contains("--migration"))
{
    using var loggerFactory = LoggerFactory.Create(loggingBuilder => loggingBuilder
        .SetMinimumLevel(LogLevel.Trace)
        .AddConsole());
    var logger = loggerFactory.CreateLogger("migration");

    KafkaMigrations.MigrateAsync(builder.Configuration["PROGRESS_KSQLDB_HOST"], logger).GetAwaiter().GetResult();

    var contextOptions = new DbContextOptionsBuilder<ProgressDbContext>()
        .UseNpgsql(builder.Configuration.GetConnectionString("ProgressDbContext"))
        .Options;

    try
    {
        using var context = new ProgressDbContext(contextOptions);
        context.Database.Migrate();
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "EF Migration Failed");
    }
}
else
{
    builder.Services.AddGrpc();
    builder.Services.AddGrpcHealthChecks().AddCheck("ProgressService", () => HealthCheckResult.Healthy());
    builder.Services.AddRouting();
    builder.Services.AddDbContext<ProgressDbContext>(options =>
        options.UseNpgsql(builder.Configuration.GetConnectionString("ProgressDbContext")));

    builder.WebHost.ConfigureKestrel(serverOptions =>
    {
        serverOptions.ListenAnyIP(5000, listenOptions =>
        {
            listenOptions.Protocols = HttpProtocols.Http1;
        });
        serverOptions.ListenAnyIP(5001, listenOptions =>
        {
            listenOptions.Protocols = HttpProtocols.Http2;
        });
    });

    var config = new ProducerConfig
    {
        BootstrapServers = builder.Configuration["PROGRESS_BOOTSTRAP_SERVERS"],
        ClientId = Dns.GetHostName()
    };

    var schemaRegistryConfig = new SchemaRegistryConfig
    {
        Url = builder.Configuration["PROGRESS_SCHEMA_REGISTRY"]
    };

    var schemaRegistryClient = new CachedSchemaRegistryClient(schemaRegistryConfig);
    builder.Services.AddSingleton(schemaRegistryClient);
    var producer = new ProducerBuilder<string, ProgressUpdated>(config).SetValueSerializer(new ProtobufSerializer<ProgressUpdated>(schemaRegistryClient)).Build();
    builder.Services.AddSingleton(producer);

    var app = builder.Build();

    app.UseRouting();
    app.UseEndpoints(endpoints =>
    {
        endpoints.MapGet("/", () => "Communication with gRPC endpoints must be made through a gRPC client. To learn how to create a client, visit: https://go.microsoft.com/fwlink/?linkid=2086909");
        endpoints.MapGrpcService<ProgressService>();
        endpoints.MapGrpcHealthChecksService();
    });

    app.Run();
}