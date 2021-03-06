
CREATE OR REPLACE STREAM S_ANALYTICS_FCT_PROGRESS_0 (
  streamId VARCHAR KEY,
  videoId VARCHAR,
  userId VARCHAR,
  progress DOUBLE,
  timestamp BIGINT
) WITH(
  KAFKA_TOPIC = 'analytics.fct.progress.0',
  VALUE_FORMAT = 'PROTOBUF',
  PARTITIONS = 3
);

CREATE OR REPLACE TABLE T_USER_SESSIONS AS
SELECT
  StreamId,
  WINDOWSTART as SessionStart,
  WINDOWEND as SessionEnd,
  COUNT(*) AS EventsCount
FROM S_ANALYTICS_FCT_PROGRESS_0
WINDOW SESSION (30 SECONDS, RETENTION 1 DAYS, GRACE PERIOD 1 MINUTES)
GROUP BY StreamId;

CREATE OR REPLACE STREAM S_USER_SESSIONS AS
SELECT
  StreamId VARCHAR KEY,
  SessionStart,
  SessionEnd,
  EventsCount
FROM T_USER_SESSIONS
WHERE SessionStart is not null and SessionEnd is not null

CREATE OR REPLACE STREAM S_FILTERED_USER_SESSIONS WITH (
  KAFKA_TOPIC = 'S_FILTERED_USER_SESSIONS',
  VALUE_FORMAT = 'PROTOBUF'
) AS
SELECT * FROM S_USER_SESSIONS
WHERE SessionStart is not null and SessionEnd is not null
EMIT CHANGES;

CREATE OR REPLACE STREAM S_USER_SESSIONS(
  StreamId VARCHAR KEY
) WITH (
  KAFKA_TOPIC = 'T_USER_SESSIONS',
  VALUE_FORMAT = 'PROTOBUF'
);

CREATE OR REPLACE STREAM S_USER_SESSIONS(
  StreamId VARCHAR KEY
) WITH (
  KAFKA_TOPIC = 'T_USER_SESSIONS',
  VALUE_FORMAT = 'PROTOBUF'
);

CREATE OR REPLACE TABLE T_TUMBLING_USER_SESSIONS AS
SELECT
  StreamId,
  MIN(SessionStart),
  MAX(SessionEnd)
FROM
  S_USER_SESSIONS
  WINDOW TUMBLING (SIZE 60 SECONDS)
  WHERE SessionStart is not null and SessionEnd is not null
  GROUP BY StreamId
EMIT CHANGES;


INSERT INTO S_ANALYTICS_FCT_PROGRESS_0(streamId, videoId, userId, progress, timestamp)
VALUES ('3|2', '3', '2', 1, 1);






CREATE STREAM S_ANALYTICS_FCT_PROGRESS_10 (
  streamId VARCHAR KEY,
  videoId VARCHAR,
  userId VARCHAR,
  progress BIGINT,
  timestamp BIGINT
) WITH(
  TIMESTAMP='progress',
  KAFKA_TOPIC = 'analytics.fct.progress.10',
  KEY_FORMAT='KAFKA',
  VALUE_FORMAT = 'PROTOBUF',
  PARTITIONS = 3
);


CREATE OR REPLACE TABLE T_USER_SESSIONS_10 WITH(
  KEY_FORMAT='KAFKA',
  VALUE_FORMAT = 'PROTOBUF',
  PARTITIONS = 3
)
AS SELECT
  streamId,
  LATEST_BY_OFFSET(videoId) as videoId,
  LATEST_BY_OFFSET(userId) as userId,
  CONCAT(streamId, '|',  CAST(EARLIEST_BY_OFFSET(timestamp) as VARCHAR)) as SessionId,
  WINDOWSTART as progressFrom,
  WINDOWEND as progressTo,
  EARLIEST_BY_OFFSET(timestamp) timestampFrom,
  LATEST_BY_OFFSET(timestamp) timestampTo
FROM S_ANALYTICS_FCT_PROGRESS_10
WINDOW SESSION (30 SECONDS, RETENTION 1 DAYS, GRACE PERIOD 60 SECONDS)
GROUP BY streamId;


CREATE OR REPLACE STREAM S_USER_SESSIONS_10(
  StreamId VARCHAR KEY
) WITH (
  KAFKA_TOPIC = 'T_USER_SESSIONS_10',
  KEY_FORMAT='KAFKA',
  VALUE_FORMAT = 'PROTOBUF'
);

CREATE OR REPLACE STREAM S_FILTERED_USER_SESSIONS_10 WITH (
  KAFKA_TOPIC = 'S_FILTERED_USER_SESSIONS_10',
  KEY_FORMAT = 'KAFKA',
  VALUE_FORMAT = 'PROTOBUF'
)
AS SELECT
  SessionId,
  videoId,
  userId,
  progressFrom,
  progressTo,
  timestampFrom,
  timestampTo
FROM S_USER_SESSIONS_10
WHERE SessionId is not null
PARTITION BY SessionId
EMIT CHANGES;