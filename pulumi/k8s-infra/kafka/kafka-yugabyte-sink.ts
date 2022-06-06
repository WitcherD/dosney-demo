import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export class KafkaYugabyteSink extends pulumi.ComponentResource {

  constructor(name: string, args: KafkaYugabyteSinkResourceArgs, opts: pulumi.ComponentResourceOptions) {
    super('kafka-yugabyte-sink', name, {}, opts);

    new k8s.apiextensions.CustomResource("yb-kafka-sink", {
      apiVersion: 'kafka.strimzi.io/v1beta2',
      kind: 'KafkaConnector',
      metadata: {
        name: 'yb-kafka-sink',
        namespace: 'kafka',
        labels: {
          'strimzi.io/cluster': 'kafka-connect',
        }
      },
      spec: {
        class: 'com.yugabyte.jdbc.JdbcSinkConnector',
        tasksMax: 3,
        config: {
          "connector.class": "com.yugabyte.jdbc.JdbcSinkConnector",
          "tasks.max": "3",
          "topics": "S_FILTERED_USER_SESSIONS_0",
          "connection.urls":"jdbc:postgresql://yb-tservers.yugabyte.svc.cluster.local:5433/yugabyte",
          "connection.user": args.yugabyteLogin,
          "connection.password": args.yugabytePassword,
          "batch.size":"256",
          "mode":"upsert",
          "insert.mode":"upsert",
          "pk.mode": "record_key",
          "pk.fields": "session_id",
          "auto.create":"false",
          "delete.enabled": "false",
          "table.name.format": "progress_sessions"
        }
      }
    }, { provider: opts.provider });
  }
}

export interface KafkaYugabyteSinkResourceArgs {
  yugabyteLogin: pulumi.Input<string>;
  yugabytePassword: pulumi.Input<string>;
}