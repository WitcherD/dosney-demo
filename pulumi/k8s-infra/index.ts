import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kafka from './kafka/kafka-deployment';
import * as yugabyte from './yugabyte/yugabyte-deployment';
import * as progress from './progress/progress-deployment';
import * as prometheus from './prometheus/prometheus-deployment';
import * as sink from './kafka/kafka-yugabyte-sink';
import * as cloudflare from "@pulumi/cloudflare";

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

const kafkaYugabyteSink = new sink.KafkaYugabyteSink('kafka-yugabyte-sink', {
  yugabyteLogin: progressCluster.yugabyteLogin,
  yugabytePassword: progressCluster.yugabytePassword.result
}, {
  provider: k8sProvider, dependsOn: [ kafkaCluster, progressCluster]
});

const dnsZone = cloudflare.getZoneOutput({
  name: stackRef.getOutput('dnsZone')
});

new cloudflare.Record("dnsRecord", {
  zoneId: dnsZone.id,
  name: stackRef.getOutput('dnsName'),
  value: progressCluster.publicAddress,
  type: "CNAME",
  allowOverwrite: true
});