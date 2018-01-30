import * as AutoScaling from "aws-sdk/clients/autoscaling";
import * as ECS from "aws-sdk/clients/ecs";
import * as ELBv2 from "aws-sdk/clients/elbv2";
import * as _ from "lodash";
import * as clusterNames from "./cluster/names";
import * as deploymentNames from "./deployment/names";
import * as regions from "./resources/regions";
import * as tags from "./resources/tags";

import { DocumentedError } from "../errors";

export interface Cluster {
  arn: string;
  name: string;
  region: string;
  instanceType?: string;
  instanceCount: number;
  desiredInstanceCount?: number;
  minInstanceCount?: number;
  maxInstanceCount?: number;
}

export async function loadClusters(): Promise<Cluster[]> {
  let clusters: Promise<Cluster[]>[] = [];
  for (let region of regions.ECS_REGIONS) {
    clusters.push(loadClustersFromRegion(region.id));
  }
  return _.flatten(await Promise.all(clusters));
}

async function loadClustersFromRegion(region: string): Promise<Cluster[]> {
  let ecs = new ECS({
    region: region
  });
  let clusterArns = await loadUntilEnd(async token => {
    let { clusterArns, nextToken } = await ecs
      .listClusters({ nextToken: token })
      .promise();
    return {
      results: clusterArns,
      nextToken
    };
  });
  if (clusterArns.length === 0) {
    // No clusters in this region.
    return [];
  }
  if (clusterArns.length > 100) {
    throw new DocumentedError(
      "Found more than 100 clusters. Giving up, this is probably not the right tool!"
    );
  }
  let clustersDescription = await ecs
    .describeClusters({
      clusters: clusterArns
    })
    .promise();
  let clusters: Promise<Cluster>[] = [];
  for (let cluster of clustersDescription.clusters || []) {
    clusters.push(loadCluster(region, cluster));
  }
  return Promise.all(clusters);
}

async function loadCluster(
  region: string,
  cluster: ECS.Cluster
): Promise<Cluster> {
  if (
    !cluster.clusterArn ||
    !cluster.clusterName ||
    cluster.registeredContainerInstancesCount === undefined
  ) {
    throw new DocumentedError("Cluster is missing key properties");
  }
  let names = clusterNames.getResourceNames(cluster.clusterName);
  let autoscaling = new AutoScaling({
    region: region
  });
  let autoScalingGroupDescription = await autoscaling
    .describeAutoScalingGroups({
      AutoScalingGroupNames: [names.autoScalingGroup]
    })
    .promise();
  let autoScalingLaunchConfigDescription = await autoscaling
    .describeLaunchConfigurations({
      LaunchConfigurationNames: [names.launchConfiguration]
    })
    .promise();
  let instanceType = undefined;
  let desiredInstanceCount = undefined;
  let minInstanceCount = undefined;
  let maxInstanceCount = undefined;
  if (
    autoScalingGroupDescription.AutoScalingGroups &&
    autoScalingGroupDescription.AutoScalingGroups.length === 1 &&
    autoScalingLaunchConfigDescription.LaunchConfigurations &&
    autoScalingLaunchConfigDescription.LaunchConfigurations.length === 1
  ) {
    let autoScalingGroup = autoScalingGroupDescription.AutoScalingGroups[0];
    let launchConfiguration =
      autoScalingLaunchConfigDescription.LaunchConfigurations[0];
    instanceType = launchConfiguration.InstanceType;
    desiredInstanceCount = autoScalingGroup.DesiredCapacity;
    minInstanceCount = autoScalingGroup.MinSize;
    maxInstanceCount = autoScalingGroup.MaxSize;
  }
  return {
    arn: cluster.clusterArn,
    name: cluster.clusterName,
    region: region,
    instanceCount: cluster.registeredContainerInstancesCount,
    instanceType,
    desiredInstanceCount,
    minInstanceCount,
    maxInstanceCount
  };
}

export interface Deployment {
  id: string;
  region: string;
  clusterName: string | null;
  dns: string | null;
  desiredTasks: number;
  pendingTasks: number;
  runningTasks: number;
}

export async function loadDeployments(): Promise<Deployment[]> {
  let deployments: Promise<Deployment[]>[] = [];
  for (let region of regions.ECS_REGIONS) {
    deployments.push(loadDeploymentsFromRegion(region.id));
  }
  return _.flatten(await Promise.all(deployments));
}

async function loadDeploymentsFromRegion(
  region: string
): Promise<Deployment[]> {
  let deploymentIds = new Set<string>();
  let loadBalancers = await loadLoadBalancersFromRegion(region);
  let deploymentPromises = [];
  for (let loadBalancer of loadBalancers) {
    if (deploymentIds.has(loadBalancer.deploymentId)) {
      // There are two load balancers for this deployment. This is not expected.
      throw new DocumentedError(
        `Unexpectedly found two load balancers for deployment ${
          loadBalancer.deploymentId
        }. Not sure what to do, giving up.`
      );
    }
    deploymentIds.add(loadBalancer.deploymentId);
    deploymentPromises.push(
      loadDeployment(
        region,
        loadBalancer.deploymentId,
        loadBalancer.clusterName,
        loadBalancer.dns
      )
    );
  }
  return Promise.all(deploymentPromises);
}

interface LoadBalancer {
  arn: string;
  dns: string;
  deploymentId: string;
  clusterName: string;
}

async function loadLoadBalancersFromRegion(
  region: string
): Promise<LoadBalancer[]> {
  let elb = new ELBv2({
    region: region
  });
  let loadBalancerDescriptions = await loadUntilEnd(async token => {
    let { LoadBalancers, NextMarker } = await elb
      .describeLoadBalancers({ Marker: token })
      .promise();
    return {
      results: LoadBalancers,
      nextToken: NextMarker
    };
  });
  let dnsByLoadBalancerArn: { [loadBalancerArn: string]: string } = {};
  for (let loadBalancer of loadBalancerDescriptions) {
    if (!loadBalancer.LoadBalancerArn || !loadBalancer.DNSName) {
      continue;
    }
    dnsByLoadBalancerArn[loadBalancer.LoadBalancerArn] = loadBalancer.DNSName;
  }
  if (Object.keys(dnsByLoadBalancerArn).length === 0) {
    return [];
  }
  let tagsDescription = await elb
    .describeTags({
      ResourceArns: Object.keys(dnsByLoadBalancerArn)
    })
    .promise();
  let loadBalancers = [];
  for (let tagDescription of tagsDescription.TagDescriptions || []) {
    if (
      !tagDescription.ResourceArn ||
      !dnsByLoadBalancerArn[tagDescription.ResourceArn]
    ) {
      continue;
    }
    let deploymentId = null;
    let clusterName = null;
    for (let tag of tagDescription.Tags || []) {
      if (tag.Key === tags.DEPLOYMENT_ID_TAG_KEY && tag.Value) {
        deploymentId = tag.Value;
      }
      if (tag.Key === tags.CLUSTER_NAME_TAG_KEY && tag.Value) {
        clusterName = tag.Value;
      }
    }
    if (deploymentId && clusterName) {
      loadBalancers.push({
        arn: tagDescription.ResourceArn,
        dns: dnsByLoadBalancerArn[tagDescription.ResourceArn],
        deploymentId,
        clusterName
      });
    }
  }
  return loadBalancers;
}

async function loadDeployment(
  region: string,
  deploymentId: string,
  clusterName: string | null,
  loadBalancerDns: string
): Promise<Deployment> {
  if (!clusterName) {
    return {
      id: deploymentId,
      region: region,
      clusterName: clusterName,
      dns: loadBalancerDns,
      desiredTasks: 0,
      pendingTasks: 0,
      runningTasks: 0
    };
  }
  let ecs = new ECS({
    region: region
  });
  let servicesDescription = await ecs
    .describeServices({
      cluster: clusterName,
      services: [deploymentNames.getResourceNames(deploymentId).service]
    })
    .promise();
  if (
    !servicesDescription.services ||
    servicesDescription.services.length === 0
  ) {
    return {
      id: deploymentId,
      region: region,
      clusterName: clusterName,
      dns: loadBalancerDns,
      desiredTasks: 0,
      pendingTasks: 0,
      runningTasks: 0
    };
  }
  let service = servicesDescription.services[0];
  return {
    id: deploymentId,
    region: region,
    clusterName: clusterName,
    dns: loadBalancerDns,
    desiredTasks: service.desiredCount || 0,
    pendingTasks: service.pendingCount || 0,
    runningTasks: service.runningCount || 0
  };
}

export interface Page<T> {
  results?: T[];
  nextToken?: string;
}

export async function loadUntilEnd<T>(
  loader: (nextToken?: string) => Promise<Page<T>>
): Promise<T[]> {
  let nextToken = undefined;
  let results: T[] = [];
  do {
    let page: Page<T> = await loader(nextToken);
    if (page.results) {
      results.push(...page.results);
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return results;
}
