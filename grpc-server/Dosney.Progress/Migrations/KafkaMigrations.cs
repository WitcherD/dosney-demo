namespace Dosney.Progress.Migrations;

public static class KafkaMigrations
{
    public static async Task MigrateAsync(string kSqlDbUrl, ILogger logger)
    {
        var httpClient = new HttpClient { BaseAddress = new Uri(kSqlDbUrl) };
            
        var createStreamResponse = await httpClient.PostAsJsonAsync("ksql", new
        {
            ksql = @"CREATE STREAM S_ANALYTICS_PROGRESS_0 (
  streamId VARCHAR KEY,
  videoId VARCHAR,
  userId VARCHAR,
  progress BIGINT,
  timestamp BIGINT
) WITH(
  KAFKA_TOPIC = 'S_ANALYTICS_PROGRESS_0',
  TIMESTAMP='progress',
  KEY_FORMAT='KAFKA',
  VALUE_FORMAT = 'PROTOBUF',
  PARTITIONS = 3,
  VALUE_SCHEMA_FULL_NAME = 'ProgressUpdated'
);"
        });
        var createStreamResponseBody = await createStreamResponse.Content.ReadAsStringAsync();
        logger.LogDebug(createStreamResponseBody);

        var createTableResponse = await httpClient.PostAsJsonAsync("ksql", new
        {
            ksql = @"CREATE TABLE T_USER_SESSIONS_0 WITH(
  KEY_FORMAT='KAFKA',
  VALUE_FORMAT = 'PROTOBUF',
  PARTITIONS = 3
)
AS SELECT
  streamId,
  LATEST_BY_OFFSET(videoId) as videoId,
  LATEST_BY_OFFSET(userId) as userId,
  CONCAT(streamId, '|',  CAST(EARLIEST_BY_OFFSET(timestamp) as VARCHAR)) as sessionId,
  WINDOWSTART as progressFrom,
  WINDOWEND as progressTo,
  EARLIEST_BY_OFFSET(timestamp) timestampFrom,
  LATEST_BY_OFFSET(timestamp) timestampTo
FROM S_ANALYTICS_PROGRESS_0
WINDOW SESSION (30 SECONDS, GRACE PERIOD 60 SECONDS)
GROUP BY streamId;"
        });

        var createTableResponseBody = await createTableResponse.Content.ReadAsStringAsync();
        logger.LogDebug(createTableResponseBody);

        var createStreamResponse2 = await httpClient.PostAsJsonAsync("ksql", new
        {
            ksql = @"CREATE STREAM S_USER_SESSIONS_0(
  streamId VARCHAR KEY
) WITH (
  KAFKA_TOPIC = 'T_USER_SESSIONS_0',
  KEY_FORMAT='KAFKA',
  VALUE_FORMAT = 'PROTOBUF'
);"
        });

        var createStreamResponseBody2 = await createStreamResponse2.Content.ReadAsStringAsync();
        logger.LogDebug(createStreamResponseBody2);

        var createStreamResponse3 = await httpClient.PostAsJsonAsync("ksql", new
        {
            ksql = @"
CREATE STREAM S_FILTERED_USER_SESSIONS_0 WITH (
  KEY_FORMAT = 'KAFKA',
  VALUE_FORMAT = 'PROTOBUF',
  PARTITIONS = 3
) 
AS SELECT
  sessionId as `session_id`,
  videoId as `video_id`,
  userId as `user_id`,
  progressFrom as `progress_from`,
  progressTo as `progress_to`,
  timestampFrom as `timestamp_from`,
  timestampTo as `timestamp_to`
FROM S_USER_SESSIONS_0
WHERE sessionId is not null
PARTITION BY sessionId
EMIT CHANGES;"
        });
        var createStreamResponseBody3 = await createStreamResponse3.Content.ReadAsStringAsync();
        logger.LogDebug(createStreamResponseBody3);
    }
}