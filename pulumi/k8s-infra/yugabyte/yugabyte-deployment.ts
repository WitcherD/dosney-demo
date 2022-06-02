import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export class YugabyteDeployment extends pulumi.ComponentResource {
    constructor(name: string, args: YugabyteDeploymentResourceArgs, opts: pulumi.ComponentResourceOptions) {
        super('yugabyte-deployment', name, {}, opts);

        const yugabyteCrd = new k8s.yaml.ConfigFile('yugabyte-crd', {
            file: 'yugabyte/yugabyte.com_ybclusters_crd.yaml',
          }, { provider: opts.provider });

          const yugabyteOperator = new k8s.yaml.ConfigFile('yugabyte-operator', {
            file: 'yugabyte/yugabyte.com-operator.yaml',
          }, { provider: opts.provider, dependsOn: yugabyteCrd });

          const yugabyteCluster = new k8s.apiextensions.CustomResource("yugabyte-cluster", {
            apiVersion: 'yugabyte.com/v1alpha1',
            kind: 'YBCluster',
            metadata: {
              name: args.clusterName,
              namespace: 'yugabyte'
            },
            spec: {
              replicationFactor: 3,
              domain: 'cluster.local',
              image: {
                repository: 'yugabytedb/yugabyte',
                tag: '2.13.2.0-b135',
                pullPolicy: 'IfNotPresent'
              },
              master: {
                replicas: 3,
                storage: {
                  size: '1Gi',
                  storageClass: args.storageClass
                },
                gflags: [{
                  key: 'webserver_interface',
                  value: '0.0.0.0'
                },
                {
                  key: 'pgsql_proxy_bind_address',
                  value: '0.0.0.0:5433'
                }]
              },
              tserver: {
                replicas: 3,
                storage: {
                  size: '5Gi',
                  storageClass: args.storageClass
                },
                gflags: [{
                  key: 'webserver_interface',
                  value: '0.0.0.0'
                },
                {
                  key: 'pgsql_proxy_bind_address',
                  value: '0.0.0.0:5433'
                }]
              }
            }
          }, { provider: opts.provider, dependsOn: yugabyteOperator });
    }
}

export interface YugabyteDeploymentResourceArgs {
    storageClass?: pulumi.Input<string>;
    clusterName: pulumi.Input<string>;
}