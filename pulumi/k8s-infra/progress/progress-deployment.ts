import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as random from "@pulumi/random";
import { RandomPassword, RandomPet } from "@pulumi/random";

export class ProgressDeployment extends pulumi.ComponentResource {

    public publicAddress: pulumi.Output<string>;
    public yugabytePassword: RandomPassword;
    public yugabyteLogin: string;

    constructor(name: string, args: ProgressDeploymentResourceArgs, opts: pulumi.ComponentResourceOptions) {
        super('progress-deployment', name, {}, opts);

        const progressNamespace = new k8s.core.v1.Namespace('progress-namespace', {
            metadata: {
              name: 'progress'
            }
          }, { provider: opts.provider });

          this.yugabyteLogin = 'progress';
          this.yugabytePassword = new random.RandomPassword("password", {
            length: 14,
            special: false
          });

          const migrationJob = new k8s.batch.v1.Job("progress-migration", {
              spec: {
                  template: {
                      spec: {
                          containers: [{
                              name: "progress-migration",
                              image: "dmitriibolotov/dosneyprogress",
                              args: [ '--migration' ],
                              env: [
                                { name: 'PROGRESS_KSQLDB_HOST', value: args.kSqlDbUrl },
                                { name: 'ConnectionStrings__ProgressDbContext', value: 'Host=yb-tservers.yugabyte.svc.cluster.local:5433;Username=yugabyte;Password=yugabyte;Database=yugabyte' },
                                { name: 'PROGRESS_YUGABYTE_LOGIN', value: this.yugabyteLogin },
                                { name: 'PROGRESS_YUGABYTE_PASSWORD', value: this.yugabytePassword.result }
                              ],
                          }],
                          restartPolicy: "Never",
                      },
                  },
                  backoffLimit: 4,
              },
              metadata: { namespace: progressNamespace.metadata.name }
          }, { provider: opts.provider });

          const progressServicePb = new kx.PodBuilder({
            containers: [{
              image: 'dmitriibolotov/dosneyprogress',
              ports: [{ name:'http20', containerPort: 5001 }] ,
              env: {
                PROGRESS_BOOTSTRAP_SERVERS: args.kafkaBootstrapServersClusterUrl,
                PROGRESS_SCHEMA_REGISTRY: args.kafkaSchemaRegistryClusterUrl,
                ConnectionStrings__ProgressDbContext: pulumi.interpolate `Host=yb-tservers.yugabyte.svc.cluster.local:5433;Username=${this.yugabyteLogin};Password=${this.yugabytePassword.result};Database=yugabyte`

              },
            }]
          });
          const progressDeployment = new kx.Deployment('progress-service', {
            spec: progressServicePb.asDeploymentSpec() ,
            metadata: { namespace: progressNamespace.metadata.name }
          }, { provider: opts.provider, dependsOn: migrationJob });

          const progressService = progressDeployment.createService({ type: 'NodePort' });

          const progressIngress = new k8s.networking.v1.Ingress("ingress",
          {
              metadata: {
                  name: "ingress",
                  namespace: progressNamespace.metadata.name,
                  annotations: {
                      "kubernetes.io/ingress.class": "alb",
                      "alb.ingress.kubernetes.io/scheme": "internet-facing",
                      "alb.ingress.kubernetes.io/group.name": "aws-alb",
                      "alb.ingress.kubernetes.io/healthcheck-protocol": "HTTP",
                      "alb.ingress.kubernetes.io/healthcheck-port": pulumi.concat(progressService.spec.ports[0].nodePort),
                      "alb.ingress.kubernetes.io/healthcheck-path": "/grpc.health.v1.Health/Check",
                      "alb.ingress.kubernetes.io/backend-protocol": "HTTP",
                      "alb.ingress.kubernetes.io/backend-protocol-version": "GRPC",
                      "alb.ingress.kubernetes.io/certificate-arn": args.hostCertArn,
                      "alb.ingress.kubernetes.io/success-codes": '0-99'
                  }
              },
              spec: {
                  rules: [{
                      http: {
                          paths: [{
                              path: "/",
                              pathType: "Prefix",
                              backend: {
                                  service: {
                                      name: progressService.metadata.name,
                                      port: { number: progressService.spec.ports[0].port },
                                  },
                              },
                          }],
                      },
                  }],
              }
          }, { provider: opts.provider });

          this.publicAddress = progressIngress.status.loadBalancer.ingress[0].hostname;
    }
}

export interface ProgressDeploymentResourceArgs {
    kafkaBootstrapServersClusterUrl: pulumi.Input<string>;
    kafkaSchemaRegistryClusterUrl: pulumi.Input<string>;
    kSqlDbUrl: pulumi.Input<string>;
    hostCertArn: pulumi.Input<string>;
}