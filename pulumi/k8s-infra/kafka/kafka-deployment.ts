import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";

export class KafkaDeployment extends pulumi.ComponentResource {

  public bootstrapServersClusterUrl: pulumi.Output<string>;
  public schemaRegistryClusterUrl: pulumi.Output<string>;
  public kSqlDbUrl: pulumi.Output<string>;

  constructor(name: string, args: KafkaDeploymentResourceArgs, opts: pulumi.ComponentResourceOptions) {
    super('kafka-deployment', name, {}, opts);

    const config = new pulumi.Config();
    const dockerIoCredentialsBase64 = config.get("dockerIoCredentials");

    const kafkaNamespaceName = 'kafka';
    const kafkaNamespace = new k8s.core.v1.Namespace('kafka-namespace', {
      metadata: {
        name: kafkaNamespaceName
      }
    }, {provider: opts.provider });

    const kafkaOperator = new k8s.helm.v3.Release("strimzi-kafka-operator",
    {
      repositoryOpts: {
          repo: "https://strimzi.io/charts/"
      },
      values: {
        featureGates: '+UseStrimziPodSets,+UseKRaft'
      },
      chart: "strimzi-kafka-operator",
      namespace: 'kafka',

    }, { provider: opts.provider });

    const kafkaCluster = new k8s.apiextensions.CustomResource("kafka-cluster", {
      apiVersion: 'kafka.strimzi.io/v1beta2',
      kind: 'Kafka',
      metadata: {
        name: args.clusterName,
        namespace: kafkaNamespace.metadata.name
      },
      spec: {
        kafka: {
          "version": "3.2.0",
          "replicas": 3,
          "listeners": [
            {
              "name": "plain",
              "port": 9092,
              "type": "internal",
              "tls": false
            },
            {
              "name": "tls",
              "port": 9093,
              "type": "internal",
              "tls": true
            }
          ],
          "config": {
            "default.replication.factor": 3,
            "offsets.topic.replication.factor": 3,
            "transaction.state.log.replication.factor": 3,
            "min.insync.replicas": 2,
            "transaction.state.log.min.isr": 2
          },
          "storage": {
            "type": "persistent-claim",
            "size": "5Gi",
            "deleteClaim": true,
            "class": args.storageClass
          }
        },
        "zookeeper": {
          "replicas": 3,
          "storage": {
            "type": "persistent-claim",
            "size": "1Gi",
            "class": args.storageClass,
            "deleteClaim": false
          }
        }
      }
    }, { provider: opts.provider, dependsOn: kafkaOperator });

    const registryDockerConfig = new k8s.core.v1.Secret("registry-docker-credentials", {
      type: 'kubernetes.io/dockerconfigjson',
      metadata: {
          name: 'registry-docker-credentials',
          namespace: kafkaNamespace.metadata.name
      },
      data: { '.dockerconfigjson': dockerIoCredentialsBase64! }
    }, { provider: opts.provider });

    const schemaRegistryPb = new kx.PodBuilder({
      containers: [{
        image: 'confluentinc/cp-schema-registry',
        ports: { http: 8081 },
        env: {
          SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: `${args.clusterName}-kafka-bootstrap:9092`,
          SCHEMA_REGISTRY_HOST_NAME: 'localhost',
          SCHEMA_REGISTRY_LISTENERS: 'http://0.0.0.0:8081'
        },
        name: 'cp-schema-registry'
      }]
    });

    const schemaRegistry = new kx.Deployment('schema-registry', {
        spec: schemaRegistryPb.asDeploymentSpec() ,
        metadata: {
          namespace: kafkaNamespace.metadata.name
        }
      },
      {
        provider: opts.provider,
        dependsOn: kafkaCluster
      });

    const schemaRegistryService = schemaRegistry.createService({ type: kx.types.ServiceType.ClusterIP });
    this.schemaRegistryClusterUrl = pulumi.concat('http://', schemaRegistryService.metadata.name, `.${kafkaNamespaceName}.svc.cluster.local:8081`);

    const kafkaConnect = new k8s.apiextensions.CustomResource("kafka-connect", {
      apiVersion: 'kafka.strimzi.io/v1beta2',
      kind: 'KafkaConnect',
      metadata: {
        name: 'kafka-connect',
        namespace: kafkaNamespace.metadata.name,
        annotations: {
          "strimzi.io/use-connector-resources": "true"
        }
      },
      spec: {
        "version": "3.2.0",
        "replicas": 3,
        "bootstrapServers": `${args.clusterName}-kafka-bootstrap:9092`,
        "config": {
          "group.id": "connect-cluster",
          "offset.storage.topic": "connect-cluster-offsets",
          "config.storage.topic": "connect-cluster-configs",
          "status.storage.topic": "connect-cluster-status",
          "config.storage.replication.factor": -1,
          "offset.storage.replication.factor": -1,
          "status.storage.replication.factor": -1,
          "key.converter": "org.apache.kafka.connect.storage.StringConverter",
          "value.converter": "io.confluent.connect.protobuf.ProtobufConverter",
          "key.converter.schemas.enable": "false",
          "value.converter.schemas.enable": "true",
          "value.converter.schema.registry.url": this.schemaRegistryClusterUrl
        },
        "build": {
          "output": {
            "type": "docker",
            "image": "dmitriibolotov/dosney-connect-cluster",
            "pushSecret": registryDockerConfig.metadata.name
          },
          "plugins": [
            {
              "name": "yb-kafka-sink",
              "artifacts": [
                // {
                //   "type": "maven",
                //   "group": "org.apache.kafka",
                //   "artifact": "connect-api",
                //   "version": "3.2.0"
                // },
                // {
                //   "type": "maven",
                //   "group": "com.google.protobuf",
                //   "artifact": "protobuf-java",
                //   "version": "3.17.3"
                // },
                // {
                //   "type": "maven",
                //   "group": "com.google.protobuf",
                //   "artifact": "protobuf-java-util",
                //   "version": "3.17.3"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/kafka-protobuf-provider/7.1.1/kafka-protobuf-provider-7.1.1.jar"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/kafka-protobuf-serializer/7.1.1/kafka-protobuf-serializer-7.1.1.jar"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/kafka-protobuf-types/7.1.1/kafka-protobuf-types-7.1.1.jar"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/kafka-schema-serializer/7.1.1/kafka-schema-serializer-7.1.1.jar"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/common-utils/7.1.1/common-utils-7.1.1.jar"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/common-config/7.1.1/common-config-7.1.1.jar"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/kafka-connect-protobuf-converter/7.1.1/kafka-connect-protobuf-converter-7.1.1.jar"
                // },
                // {
                //   "type": "jar",
                //   "url": "https://packages.confluent.io/maven/io/confluent/kafka-schema-registry-client/7.1.1/kafka-schema-registry-client-7.1.1.jar"
                // },
                {
                  "type": "zip",
                  "url": "https://github.com/WitcherD/dosney-demo/raw/master/confluentinc-kafka-connect-protobuf-converter-7.1.1.zip"
                },
                {
                  "type": "jar",
                  "url": "https://github.com/yugabyte/yb-kafka-sink/raw/yb-1.x/kafka-connect-yugabytedb-sink-1.4.1-SNAPSHOT.jar"
                },
              ]
            }
          ]
        }
      }
    }, { provider: opts.provider, dependsOn: kafkaCluster });

    const kSqlDbPb = new kx.PodBuilder({
      containers: [{
        image: 'confluentinc/ksqldb-server',
        ports: { http: 8088 },
        env: {
          KSQL_BOOTSTRAP_SERVERS: `${args.clusterName}-kafka-bootstrap:9092`,
          KSQL_KSQL_SCHEMA_REGISTRY_URL: pulumi.concat('http://', schemaRegistryService.metadata.name, ':8081')
        },
        name: 'ksqldb'
      }]
    });

    const kSqlDb = new kx.Deployment('ksqldb', {
      spec: kSqlDbPb.asDeploymentSpec() ,
      metadata: {
        namespace: kafkaNamespace.metadata.name
      }
    },
    {
      provider: opts.provider,
      dependsOn: kafkaCluster
    });

    const kSqlDbService = kSqlDb.createService({ type: kx.types.ServiceType.ClusterIP });

    const kafkaUiPb = new kx.PodBuilder({
      containers: [{
        image: 'provectuslabs/kafka-ui:latest',
        ports: { http: 8080 },
        env: {
          KAFKA_CLUSTERS_0_NAME: 'k8s kafka cluster',
          KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: `${args.clusterName}-kafka-bootstrap:9092`,
          KAFKA_CLUSTERS_0_KSQLDBSERVER: pulumi.concat(kSqlDbService.metadata.name, ':8088'),
          KAFKA_CLUSTERS_0_SCHEMAREGISTRY: pulumi.concat('http://', schemaRegistryService.metadata.name, ':8081'),
          KAFKA_CLUSTERS_0_KAFKACONNECT_0_ADDRESS: pulumi.concat('http://', kafkaConnect.metadata.name, '-connect-api:8083'),
          KAFKA_CLUSTERS_0_KAFKACONNECT_0_NAME: 'kafka connect',
        },
      }]
    });

    const kafkaUi = new kx.Deployment('kafka-ui', {
      spec: kafkaUiPb.asDeploymentSpec() ,
      metadata: { namespace: kafkaNamespace.metadata.name }
    },
    {
      provider: opts.provider,
      dependsOn: kafkaCluster
    });

    const kafkaUiService = kafkaUi.createService({ type: kx.types.ServiceType.ClusterIP });

    this.bootstrapServersClusterUrl = pulumi.Output.create<string>(`${args.clusterName}-kafka-bootstrap.${kafkaNamespaceName}.svc.cluster.local:9092`);
    this.kSqlDbUrl = pulumi.concat('http://', kSqlDbService.metadata.name, `.${kafkaNamespaceName}.svc.cluster.local:8088`)
  }
}

export interface KafkaDeploymentResourceArgs {
  storageClass?: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
}