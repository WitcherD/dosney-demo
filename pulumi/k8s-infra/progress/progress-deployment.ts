import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";

export class ProgressDeployment extends pulumi.ComponentResource {
    constructor(name: string, args: ProgressDeploymentResourceArgs, opts: pulumi.ComponentResourceOptions) {
        super('progress-deployment', name, {}, opts);

        const progressNamespace = new k8s.core.v1.Namespace('progress-namespace', {
            metadata: {
              name: 'progress'
            }
          }, { provider: opts.provider });

          const migrationJob = new k8s.batch.v1.Job("progress-migration", {
              spec: {
                  template: {
                      spec: {
                          containers: [{
                              name: "progress-migration",
                              image: "dmitriibolotov/dosneyprogress",
                              args: [ '--migration' ],
                              env: [
                                { name: 'PROGRESS_KSQLDB_HOST', value: args.kSqlDbUrl }
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
                PROGRESS_SCHEMA_REGISTRY: args.kafkaSchemaRegistryClusterUrl
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
    }
}

export interface ProgressDeploymentResourceArgs {
    kafkaBootstrapServersClusterUrl: pulumi.Input<string>;
    kafkaSchemaRegistryClusterUrl: pulumi.Input<string>;
    kSqlDbUrl: pulumi.Input<string>;
    hostCertArn: pulumi.Input<string>;
}