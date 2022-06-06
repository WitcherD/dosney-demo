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
        var deliveryResult = await _progressKafkaProducer.ProduceAsync("S_ANALYTICS_PROGRESS_0", new Message<string, ProgressUpdated>
        {
            Key = $"{request.UserId}|{request.VideoId}",
            Value = new ProgressUpdated
            {
                VIDEOID = request.VideoId,
                USERID = request.UserId,
                PROGRESS = request.Progress,
                TIMESTAMP = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            }
        });

        return new UpdateProgressResult { Acknowledged = deliveryResult.Status == PersistenceStatus.Persisted };
    }

    public override async Task<GetUserSessionsResult> GetUserSessions(GetUserSessionsRequest request, ServerCallContext context)
    {
        var sessions = await _dbContext.ProgressSessions
            .Where(i => i.UserId == request.UserId)
            .OrderByDescending(i => i.TimestampTo)
            .Skip(request.Skip)
            .Take(request.Take)
            .AsNoTracking()
            .ToListAsync(context.CancellationToken);

        return new GetUserSessionsResult { Result = { sessions.Select(i => new UserSession
        {
            VideoId = i.VideoId, 
            UserId = i.UserId, 
            ProgressFrom = i.ProgressFrom, 
            ProgressTo = i.ProgressTo
        })}};
    }
}
