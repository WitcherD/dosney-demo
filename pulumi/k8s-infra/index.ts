import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kafka from './kafka/kafka-deployment';
import * as yugabyte from './yugabyte/yugabyte-deployment';
import * as progress from './progress/progress-deployment';
import * as prometheus from './prometheus/prometheus-deployment';

let config = new pulumi.Config();

const stackRef = new pulumi.StackReference(config.get('infraStack')!);
const storageClass = config.get('storageClass');

const k8sProvider = new k8s.Provider('k8s-provider', {
  kubeconfig: stackRef.getOutput('kubeconfig')
});

const kafkaCluster = new kafka.KafkaDeployment('kafka', {
  clusterName: 'dosney-kafka',
  storageClass: storageClass
}, { provider: k8sProvider });

const yugabyteCluster = new yugabyte.YugabyteDeployment('kafka', {
  clusterName: 'dosney-yugabyte',
  storageClass: storageClass
}, { provider: k8sProvider });

const progressCluster = new progress.ProgressDeployment('progress', {
  hostCertArn: stackRef.getOutput('hostCertArn'),
  kafkaBootstrapServersClusterUrl: kafkaCluster.bootstrapServersClusterUrl,
  kafkaSchemaRegistryClusterUrl: kafkaCluster.schemaRegistryClusterUrl,
  kSqlDbUrl: kafkaCluster.kSqlDbUrl,
}, { provider: k8sProvider });

const prometheusCluster = new prometheus.PrometheusDeployment('prometheus', {
}, { provider: k8sProvider });

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
      "connection.user":"yugabyte",
      "connection.password":"yugabyte",
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
}, { provider: k8sProvider, dependsOn: [ kafkaCluster, progressCluster] });
