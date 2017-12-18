import * as clusters from "../resources/clusters";
import * as console from "../../console";
import * as deployModel from "../../deploymodel";
import * as docker from "../../docker";
import * as loadBalancers from "../resources/loadbalancers";
import * as repositories from "../resources/repositories";
import * as securityGroups from "../resources/securitygroups";
import * as services from "../resources/services";
import * as tags from "../resources/tags";
import * as targetGroups from "../resources/targetgroups";
import * as taskDefinitions from "../resources/taskdefinitions";
import * as vpcs from "../resources/vpcs";

import { getResourceNames } from "./names";

export interface DeployResult {
  deploymentId: string;
  repositoryName: string;
  repositoryImageTag: string;
  loadBalancerSecurityGroupId: string;
  loadBalancerArn: string;
  taskDefinitionArn: string;
  targetGroupArn: string;
  loadBalancerListenerArn: string;
  serviceArn: string;
  dns: string;
}

export async function deploy(
  deploymentSpec: deployModel.DeploymentSpec,
  deploymentId: string
): Promise<DeployResult> {
  let deploymentTags = [
    tags.SHARED_TAG,
    tags.clusterNameTag(deploymentSpec.cluster.name),
    tags.deploymentIdTag(deploymentId)
  ];
  let names = getResourceNames(deploymentId);
  let cluster: clusters.Cluster | undefined;
  let dockerImagePushed = false;
  let loadBalancerSecurityGroupCreated = false;
  let loadBalancerCreated = false;
  let taskDefinitionCreated = false;
  let targetGroupCreated = false;
  let serviceCreated = false;

  try {
    console.logInfo(`Building Docker image ${names.localDockerImage}...`);
    await docker.createDockerImage(
      deploymentSpec.container.imageSource.dockerfilePath,
      names.localDockerImage
    );
    let dockerImageExposedPort = await docker.getExposedPort(
      names.localDockerImage
    );
    console.logInfo(`✔ Docker image built.`);

    let repository = await repositories.getOrCreateRepository(
      deploymentSpec.cluster.region,
      names.repository
    );

    console.logInfo(
      `Pushing to ${repository.uri}:${names.remoteDockerImageTag}...`
    );
    let uri = await docker.pushDockerImage(
      deploymentSpec.cluster.region,
      names.localDockerImage,
      repository.uri,
      names.remoteDockerImageTag,
      await repositories.getAuthConfig(deploymentSpec.cluster.region)
    );
    console.logInfo(`✔ Docker image pushed to ${uri}.`);
    dockerImagePushed = true;

    console.logInfo(
      `Finding cluster ${deploymentSpec.cluster.name} in region ${
        deploymentSpec.cluster.region
      }...`
    );
    cluster = await clusters.getCluster(
      deploymentSpec.cluster.region,
      deploymentSpec.cluster.name
    );
    console.logInfo(`✔ Found cluster ${cluster.name}.`);

    // Get the default VPC. Create it if necessary.
    // TODO: Instead, get the VPC associated with the cluster.
    console.logInfo(`Looking up default VPC and subnets...`);
    let vpc = await vpcs.getDefaultVpcAndSubnets(deploymentSpec.cluster.region);
    console.logInfo(`✔ Using default VPC with ID ${vpc.id}.`);

    // Create security groups (ELB + ECS) and configure their relationship.
    console.logInfo(
      `Creating security group ${names.loadBalancerSecurityGroup}...`
    );
    let loadBalancerSecurityGroup = await securityGroups.createLoadBalancerSecurityGroup(
      deploymentSpec.cluster.region,
      names.loadBalancerSecurityGroup,
      vpc.id,
      deploymentTags
    );
    console.logInfo(
      `✔ Security group ${names.loadBalancerSecurityGroup} created.`
    );
    loadBalancerSecurityGroupCreated = true;

    console.logInfo(`Getting default security group for cluster...`);
    let defaultSecurityGroupId = await securityGroups.getDefaultSecurityGroupId(
      deploymentSpec.cluster.region,
      vpc.id
    );
    console.logInfo(
      `✔ Cluster using default security group with ID ${defaultSecurityGroupId}.`
    );

    // TODO: Support HTTPS on 443.
    let loadBalancerPort = 80;

    console.logInfo(`Configuring security group ingress rules...`);
    await securityGroups.configureSecurityGroups(
      deploymentSpec.cluster.region,
      loadBalancerSecurityGroup.id,
      defaultSecurityGroupId,
      [loadBalancerPort]
    );
    console.logInfo(`✔ Security group ingress rules set up successfully.`);

    // Create load balancer.
    console.logInfo(`Creating load balancer ${names.loadBalancer}...`);
    let loadBalancer = await loadBalancers.createLoadBalancer(
      deploymentSpec.cluster.region,
      names.loadBalancer,
      vpc.subnetIds,
      loadBalancerSecurityGroup.id,
      deploymentTags
    );
    console.logInfo(
      `✔ Load balancer ${
        names.loadBalancer
      } created successfully. It may take a few minutes to provision...`
    );
    loadBalancerCreated = true;

    // Register task definition.
    console.logInfo(`Creating task definition ${names.taskDefinition}...`);
    let taskDefinition = await taskDefinitions.createTaskDefinition(
      deploymentSpec.cluster.region,
      names.taskDefinition,
      names.container,
      repository.uri + ":" + names.remoteDockerImageTag,
      loadBalancer.dns,
      dockerImageExposedPort,
      deploymentSpec.container.memory,
      deploymentSpec.container.cpuUnits,
      deploymentSpec.environment
    );
    console.logInfo(
      `✔ Task definition created in family ${taskDefinition.family}.`
    );
    taskDefinitionCreated = true;

    // Create target group.
    console.logInfo(`Creating target group ${names.targetGroup}...`);
    let targetGroup = await targetGroups.createTargetGroup(
      deploymentSpec.cluster.region,
      names.targetGroup,
      vpc.id,
      loadBalancerPort,
      deploymentTags
    );
    console.logInfo(`✔ Created target group ${names.targetGroup}.`);
    targetGroupCreated = true;

    // Add load balancer listener for target group.
    console.logInfo(
      `Creating listener for load balancer ${loadBalancer.name}...`
    );
    let loadBalancerListener = await loadBalancers.createListener(
      deploymentSpec.cluster.region,
      loadBalancer.arn,
      loadBalancerPort,
      targetGroup.arn
    );
    console.logInfo(`✔ Created load balancer listener.`);

    // Create service in cluster.
    console.logInfo(`Creating service ${names.service}...`);
    let service = await services.createService(
      deploymentSpec.cluster.region,
      names.service,
      names.container,
      cluster.arn,
      taskDefinition.arn,
      targetGroup.arn,
      deploymentSpec.desiredCount,
      dockerImageExposedPort
    );
    console.logInfo(`✔ Created service ${names.service}.`);
    serviceCreated = true;

    console.logSuccess(
      `Deployed successfully at http://${
        loadBalancer.dns
      } (live in a few minutes).`
    );

    return {
      deploymentId,
      repositoryName: names.repository,
      repositoryImageTag: names.remoteDockerImageTag,
      loadBalancerSecurityGroupId: loadBalancerSecurityGroup.id,
      loadBalancerArn: loadBalancer.arn,
      taskDefinitionArn: taskDefinition.arn,
      targetGroupArn: targetGroup.arn,
      loadBalancerListenerArn: loadBalancerListener.arn,
      serviceArn: service.arn,
      dns: loadBalancer.dns
    };
  } catch (e) {
    console.logError(e);
    if (cluster) {
      if (serviceCreated) {
        console.logInfo(`Rolling back service ${names.service}...`);
        try {
          await services.destroyService(
            deploymentSpec.cluster.region,
            cluster.arn,
            names.service
          );
          console.logInfo(`✔ Destroyed service ${names.service}.`);
        } catch {
          console.logInfo(`Could not roll back ${names.service}.`);
        }
      }
      if (targetGroupCreated) {
        console.logInfo(`Rolling back target group ${names.targetGroup}...`);
        try {
          await targetGroups.deleteTargetGroup(
            deploymentSpec.cluster.region,
            names.targetGroup
          );
          console.logInfo(`✔ Deleted target group ${names.targetGroup}.`);
        } catch {
          console.logInfo(`Could not roll back ${names.targetGroup}.`);
        }
      }
      if (taskDefinitionCreated) {
        console.logInfo(
          `Rolling back task definition ${names.taskDefinition}...`
        );
        try {
          await taskDefinitions.deregisterTaskDefinition(
            deploymentSpec.cluster.region,
            names.taskDefinition
          );
          console.logInfo(
            `✔ Deregistered task definition ${names.taskDefinition}.`
          );
        } catch {
          console.logInfo(`Could not roll back ${names.taskDefinition}.`);
        }
      }
      if (loadBalancerCreated) {
        console.logInfo(`Rolling back load balancer ${names.loadBalancer}...`);
        try {
          await loadBalancers.destroyLoadBalancer(
            deploymentSpec.cluster.region,
            names.loadBalancer
          );
          console.logInfo(`✔ Destroyed load balancer ${names.loadBalancer}.`);
        } catch {
          console.logInfo(`Could not roll back ${names.loadBalancer}.`);
        }
      }
      if (loadBalancerSecurityGroupCreated) {
        console.logInfo(
          `Rolling back load balancer security group ${
            names.loadBalancerSecurityGroup
          }...`
        );
        try {
          await securityGroups.deleteLoadBalancerSecurityGroup(
            deploymentSpec.cluster.region,
            names.loadBalancerSecurityGroup
          );
          console.logInfo(
            `✔ Deleted load balancer security group ${
              names.loadBalancerSecurityGroup
            }.`
          );
        } catch {
          console.logInfo(
            `Could not roll back ${names.loadBalancerSecurityGroup}.`
          );
        }
      }
    }
    if (dockerImagePushed) {
      console.logInfo(
        `Rolling back Docker image ${names.repository}:${
          names.remoteDockerImageTag
        }...`
      );
      try {
        await repositories.deleteImage(
          deploymentSpec.cluster.region,
          names.repository,
          names.remoteDockerImageTag
        );
        console.logInfo(
          `✔ Deleted Docker image ${names.repository}:${
            names.remoteDockerImageTag
          }.`
        );
      } catch {
        console.logInfo(
          `Could not roll back ${names.repository}:${
            names.remoteDockerImageTag
          }.`
        );
      }
    }
    throw new console.AlreadyLoggedError(e);
  }
}

export async function destroy(
  region: string,
  clusterName: string | null,
  deploymentId: string
) {
  let names = getResourceNames(deploymentId);
  // TODO: Error handling around each step.
  console.logInfo(`Deregistering task definition ${names.taskDefinition}...`);
  await taskDefinitions.deregisterTaskDefinition(region, names.taskDefinition);
  console.logInfo(`✔ Deregistered task definition ${names.taskDefinition}.`);
  if (clusterName) {
    console.logInfo(`Destroying service ${names.service}...`);
    await services.destroyService(region, clusterName, names.service);
    console.logInfo(`✔ Destroyed service ${names.service}.`);
  }
  console.logInfo(
    `Deleting Docker image ${names.repository}:${names.remoteDockerImageTag}...`
  );
  await repositories.deleteImage(
    region,
    names.repository,
    names.remoteDockerImageTag
  );
  console.logInfo(
    `✔ Deleted Docker image ${names.repository}:${names.remoteDockerImageTag}.`
  );
  console.logInfo(`Destroying load balancer ${names.loadBalancer}...`);
  await loadBalancers.destroyLoadBalancer(region, names.loadBalancer);
  console.logInfo(`✔ Destroyed load balancer ${names.loadBalancer}.`);
  console.logInfo(`Deleting target group ${names.targetGroup}...`);
  await targetGroups.deleteTargetGroup(region, names.targetGroup);
  console.logInfo(`✔ Destroyed target group ${names.targetGroup}.`);
  console.logInfo(
    `Deleting load balancer security group ${
      names.loadBalancerSecurityGroup
    }...`
  );
  await securityGroups.deleteLoadBalancerSecurityGroup(
    region,
    names.loadBalancerSecurityGroup
  );
  console.logInfo(
    `✔ Destroyed load balancer security group ${
      names.loadBalancerSecurityGroup
    }`
  );
  console.logSuccess(`Destroyed deployment ${deploymentId} successfully.`);
}
