import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as fs from 'fs';
import * as YAML from 'yaml';
import * as path from 'path';


export class PrometheusDeployment extends pulumi.ComponentResource {
    constructor(name: string, args: {}, opts: pulumi.ComponentResourceOptions) {
        super('prometheus-deployment', name, {}, opts);

        const prometheusCrds: k8s.apiextensions.CustomResource[] = [];
        fs.readdirSync("prometheus").forEach((file) => {
            if (path.extname(file) == ".yaml") {
                const content: any = YAML.parse(
                    fs.readFileSync(`prometheus/${file}`).toString()
                );
                prometheusCrds.push(
                    new k8s.apiextensions.CustomResource(content.metadata.name, content as k8s.apiextensions.CustomResourceArgs,
                        { provider: opts.provider }
                    )
                );
            }
        });

        new k8s.helm.v3.Release("helm-promethues",
        {
            repositoryOpts: {
                repo: "https://prometheus-community.github.io/helm-charts"
            },
            chart: "kube-prometheus-stack",
            values: {
                skipCRDRendering: true,
            },
            namespace: 'promethues',
            createNamespace: true
        }, {dependsOn: prometheusCrds, provider: opts.provider });
    }
}