using Confluent.Kafka;
using Dosney.Progress.Database;
using Dosney.Progress.Kafka;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;

namespace Dosney.Progress.Services;

public class ProgressService : WatchingProgress.WatchingProgressBase
{
    private readonly IProducer<string, ProgressUpdated> _progressKafkaProducer;
    private readonly ProgressDbContext _dbContext;

    public ProgressService(IProducer<string, ProgressUpdated> progressKafkaProducer, ProgressDbContext dbContext)
    {
        _progressKafkaProducer = progressKafkaProducer;
        _dbContext = dbContext;
    }

    public override async Task<UpdateProgressResult> UpdateProgress(UpdateProgressRequest request, ServerCallContext context)
    {
        var deliveryResult = await _progressKafkaProducer.ProduceAsync("analytics.fct.progress.0", new Message<string, ProgressUpdated>
        {
            Key = $"{request.UserId}|{request.VideoId}",
            Value = new ProgressUpdated
            {
                VideoId = request.VideoId,
                UserId = request.UserId,
                Progress = request.Progress,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            }
        });

        return new UpdateProgressResult { Acknowledged = deliveryResult.Status == PersistenceStatus.Persisted };
    }

    public override async Task<GetProgressResult> GetProgress(GetProgressRequest request, ServerCallContext context)
    {
        var sessions = await _dbContext.ProgressSessions
            .Where(i => i.UserId == request.UserId)
            .OrderByDescending(i => i.TimestampTo)
            .Skip(0)
            .Take(10)
            .AsNoTracking()
            .ToListAsync(context.CancellationToken);

        return new GetProgressResult { Result = { sessions.Select(i => new Progress()) } };
    }
}
