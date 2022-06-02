import * as civo from "@pulumi/civo";

const network = new civo.Network('civo-network-02', {
  label: 'k3s-network-02',
  region: 'FRA1',
});

const firewall = new civo.Firewall('civo-firewall-02', {
  name: 'civo-firewall-02',
  region: 'FRA1',
  createDefaultRules: true,
  networkId: network.id
});

const cluster = new civo.KubernetesCluster('civo-k3s-cluster', {
  name: 'civo-k3s-cluster',
  pools: {
    nodeCount: 3,
    size: 'g4s.kube.large'
  },
  region: 'FRA1',
  firewallId: firewall.id,
  networkId: network.id
});

export const kubeconfig = cluster.kubeconfig;