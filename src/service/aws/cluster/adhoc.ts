import * as autoScalingGroups from "../resources/autoscalinggroups";
import * as autoScalingLaunchConfigs from "../resources/autoscalinglaunchconfigs";
import * as clusters from "../resources/clusters";
import * as console from "../../console";
import * as deployModel from "../../deploymodel";
import * as securityGroups from "../resources/securitygroups";
import * as services from "../resources/services";
import * as tags from "../resources/tags";
import * as vpcs from "../resources/vpcs";

import { getResourceNames } from "./names";

export interface CreateClusterResult {
  clusterArn: string;
  launchConfigurationName: string;
  autoScalingGroupName: string;
}

export async function createCluster(
  clusterSpec: deployModel.ClusterSpec
): Promise<CreateClusterResult> {
  let clusterArn = null;
  let names = getResourceNames(clusterSpec.name);
  let launchConfigurationCreated = false;
  let autoScalingGroupCreated = false;
  let clusterTags = [tags.SHARED_TAG, tags.clusterNameTag(clusterSpec.name)];

  try {
    // Set up cluster.
    console.logInfo(`Setting up cluster ${clusterSpec.name}...`);
    clusterArn = await clusters.createCluster(
      clusterSpec.region,
      clusterSpec.name
    );
    console.logInfo(`✔ Created empty ECS cluster ${clusterSpec.name}.`);

    // Get the default VPC. Create it if necessary.
    console.logInfo(`Looking up default VPC and subnets...`);
    let vpc = await vpcs.getDefaultVpcAndSubnets(clusterSpec.region);
    console.logInfo(`✔ Using default VPC with ID ${vpc.id}.`);

    // Get default security group.
    console.logInfo(`Getting default security group...`);
    let defaultSecurityGroupId = await securityGroups.getDefaultSecurityGroupId(
      clusterSpec.region,
      vpc.id
    );
    console.logInfo(
      `✔ Using default security group with ID ${defaultSecurityGroupId}.`
    );

    console.logInfo(
      `Creating auto scaling launch configuration ${
        names.launchConfiguration
      }...`
    );
    await autoScalingLaunchConfigs.createAutoScalingLaunchConfiguration(
      clusterSpec.region,
      names.launchConfiguration,
      clusterSpec.name,
      clusterSpec.ec2InstanceType,
      defaultSecurityGroupId
    );
    launchConfigurationCreated = true;
    console.logInfo(
      `✔ Created auto scaling launch configuration ${
        names.launchConfiguration
      }.`
    );

    console.logInfo(`Creating auto scaling group ${names.autoScalingGroup}...`);
    await autoScalingGroups.createAutoScalingGroup(
      clusterSpec.region,
      names.autoScalingGroup,
      names.launchConfiguration,
      names.instance,
      clusterSpec.ec2InstanceCount,
      clusterSpec.ec2InstanceCount,
      vpc.subnetIds,
      clusterTags
    );
    autoScalingGroupCreated = true;
    console.logInfo(`✔ Created auto scaling group ${names.autoScalingGroup}.`);

    console.logSuccess(`Cluster ${clusterSpec.name} created successfully.`);
    return {
      clusterArn,
      launchConfigurationName: names.launchConfiguration,
      autoScalingGroupName: names.autoScalingGroup
    };
  } catch (e) {
    console.logError(e);
    if (autoScalingGroupCreated) {
      console.logInfo(
        `Rolling back auto scaling group ${names.autoScalingGroup}...`
      );
      try {
        await autoScalingGroups.destroyAutoScalingGroup(
          clusterSpec.region,
          names.autoScalingGroup
        );
        console.logInfo(
          `✔ Destroyed auto scaling group ${names.autoScalingGroup}.`
        );
      } catch {
        console.logInfo(`Could not roll back ${names.autoScalingGroup}.`);
      }
    }
    if (launchConfigurationCreated) {
      console.logInfo(
        `Rolling back auto scaling launch configuration ${
          names.launchConfiguration
        }...`
      );
      try {
        await autoScalingLaunchConfigs.destroyAutoScalingLaunchConfiguration(
          clusterSpec.region,
          names.launchConfiguration
        );
        console.logInfo(
          `✔ Destroyed auto scaling launch configuration ${
            names.launchConfiguration
          }.`
        );
      } catch {
        console.logInfo(`Could not roll back ${names.launchConfiguration}.`);
      }
    }
    if (clusterArn) {
      console.logInfo(`Rolling back cluster ${clusterSpec.name}...`);
      try {
        await clusters.destroyCluster(clusterSpec.region, clusterArn);
        console.logInfo(`✔ Destroyed cluster ${clusterSpec.name}.`);
      } catch {
        console.logInfo(`Could not roll back ${clusterSpec.name}.`);
      }
    }
    throw new console.AlreadyLoggedError(e);
  }
}

export async function destroy(region: string, clusterArn: string) {
  let cluster = await clusters.getCluster(region, clusterArn);
  let names = getResourceNames(cluster.name);
  console.logInfo(`Destroying services in cluster ${cluster.name}...`);
  let serviceArns = await services.getServicesInCluster(region, clusterArn);
  let destroyedServiceCount = 0;
  for (let serviceArn of serviceArns) {
    await services.destroyService(region, clusterArn, serviceArn);
    destroyedServiceCount++;
  }
  console.logInfo(
    `✔ Destroyed ${destroyedServiceCount} service${
      destroyedServiceCount === 1 ? "" : "s"
    }.`
  );
  console.logInfo(`Destroying cluster ${cluster.name}...`);
  await clusters.destroyCluster(region, clusterArn);
  console.logInfo(`✔ Destroyed cluster ${cluster.name}.`);
  console.logInfo(`Destroying auto scaling group ${names.autoScalingGroup}...`);
  await autoScalingGroups.destroyAutoScalingGroup(
    region,
    names.autoScalingGroup
  );
  console.logInfo(`✔ Destroyed auto scaling group ${names.autoScalingGroup}.`);
  console.logInfo(
    `Destroying auto scaling launch configuration ${
      names.launchConfiguration
    }...`
  );
  await autoScalingLaunchConfigs.destroyAutoScalingLaunchConfiguration(
    region,
    names.launchConfiguration
  );
  console.logInfo(
    `✔ Destroyed auto scaling launch configuration ${
      names.launchConfiguration
    }.`
  );
  console.logSuccess(`Cluster ${cluster.name} destroyed successfully.`);
}
