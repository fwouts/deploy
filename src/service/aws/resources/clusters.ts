import * as AWS from "aws-sdk";
import * as loader from "../loader";

export interface Cluster {
  name: string;
  arn: string;
}

export async function getCluster(
  region: string,
  clusterNameOrArn: string
): Promise<Cluster> {
  let ecs = new AWS.ECS({
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

export async function createCluster(
  region: string,
  name: string
): Promise<string> {
  // TODO: Double check the name's format.
  let ecs = new AWS.ECS({
    region: region
  });
  let existingClusterDescription = await ecs
    .describeClusters({
      clusters: [name]
    })
    .promise();
  for (let existingCluster of existingClusterDescription.clusters || []) {
    if (existingCluster.status === "ACTIVE") {
      throw new Error(`A cluster with the name ${name} already exists.`);
    }
  }
  let clusterCreation = await ecs
    .createCluster({
      clusterName: name
    })
    .promise();
  if (!clusterCreation.cluster) {
    throw new Error("Cluster could not be created.");
  }
  if (
    !clusterCreation.cluster.clusterName ||
    !clusterCreation.cluster.clusterArn
  ) {
    throw new Error("Cluster is missing key properties.");
  }
  return clusterCreation.cluster.clusterArn;
}

export async function destroyCluster(region: string, clusterArn: string) {
  let ecs = new AWS.ECS({
    region
  });
  let clusterDescription = await ecs
    .describeClusters({
      clusters: [clusterArn]
    })
    .promise();
  if (
    !clusterDescription.clusters ||
    clusterDescription.clusters.length === 0
  ) {
    throw new Error("Cluster could not be found.");
  }
  let cluster = clusterDescription.clusters[0];
  if (!cluster.clusterName) {
    throw new Error("Cluster is missing a name.");
  }
  let containerInstanceArns = await loader.loadUntilEnd(async token => {
    let { containerInstanceArns, nextToken } = await ecs
      .listContainerInstances({
        cluster: clusterArn,
        nextToken: token
      })
      .promise();
    return {
      results: containerInstanceArns,
      nextToken
    };
  });
  for (let containerInstanceArn of containerInstanceArns) {
    await ecs
      .deregisterContainerInstance({
        cluster: clusterArn,
        containerInstance: containerInstanceArn,
        force: true
      })
      .promise();
  }
  await ecs
    .deleteCluster({
      cluster: clusterArn
    })
    .promise();
}
