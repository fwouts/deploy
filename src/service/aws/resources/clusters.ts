import * as ECS from "aws-sdk/clients/ecs";

export interface Cluster {
  name: string;
  arn: string;
}

export async function getCluster(
  region: string,
  clusterNameOrArn: string
): Promise<Cluster> {
  let ecs = new ECS({
    region: region
  });
  let clusters = await ecs
    .describeClusters({
      clusters: [clusterNameOrArn]
    })
    .promise();
  if (clusters.clusters && clusters.clusters.length === 1) {
    let cluster = clusters.clusters[0];
    if (!cluster.clusterArn || !cluster.clusterName) {
      throw new Error("Cluster is missing key properties.");
    }
    return {
      name: cluster.clusterName,
      arn: cluster.clusterArn
    };
  } else {
    throw new Error("Could not find existing cluster: " + clusterNameOrArn);
  }
}
