import * as console from "../console";
import * as deployModel from "../deploymodel";
import * as images from "./resources/images";
import * as securityGroups from "./resources/securitygroups";
import * as stacks from "./resources/stacks";
import * as vpcs from "./resources/vpcs";

import { AWS } from "cloudformation-declarations";

const btoa = require("btoa");

const ECS_INSTANCE_ROLE_NAME = "ecsInstanceRole";

export interface CreateClusterResult {
  clusterName: string;
  launchConfigurationName: string;
  autoScalingGroupName: string;
}

export async function createCluster(
  clusterSpec: deployModel.ClusterSpec
): Promise<CreateClusterResult> {
  let names = getResourceNames(clusterSpec.name);

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

  // Get ECS image ID.
  console.logInfo(`Getting ECS optimized AMI...`);
  let imageId = await images.getEcsImageId(clusterSpec.region);
  console.logInfo(`✔ Using AMI ${imageId}.`);

  let cluster: AWS.ECS.Cluster = {
    Type: "AWS::ECS::Cluster",
    Properties: {
      ClusterName: clusterSpec.name
    }
  };
  console.logInfo(
    `Creating CloudFormation stack ${names.cloudFormationStack}...`
  );
  try {
    // TODO: Fail with a helpful message if ecsInstanceRole is not available.
    let autoScalingLaunchConfiguration: AWS.AutoScaling.LaunchConfiguration = {
      Type: "AWS::AutoScaling::LaunchConfiguration",
      Properties: {
        InstanceType: clusterSpec.ec2InstanceType,
        ImageId: imageId,
        SecurityGroups: [defaultSecurityGroupId],
        IamInstanceProfile: ECS_INSTANCE_ROLE_NAME,
        UserData: btoa(
          `#!/bin/bash
  echo ECS_CLUSTER=${clusterSpec.name} >> /etc/ecs/ecs.config`
        )
      }
    };
    let autoScalingGroup: AWS.AutoScaling.AutoScalingGroup = {
      Type: "AWS::AutoScaling::AutoScalingGroup",
      Properties: {
        LaunchConfigurationName: {
          Ref: "autoScalingLaunchConfiguration"
        } as any,
        MinSize: clusterSpec.ec2InstanceCount.toString(10),
        MaxSize: clusterSpec.ec2InstanceCount.toString(10),
        VPCZoneIdentifier: vpc.subnetIds
      }
    };
    let cloudFormationTemplate = {
      AWSTemplateFormatVersion: "2010-09-09",
      Resources: {
        cluster,
        autoScalingLaunchConfiguration,
        autoScalingGroup
      }
    };
    await stacks.createCloudFormationStack(
      clusterSpec.region,
      names.cloudFormationStack,
      cloudFormationTemplate
    );
  } catch (e) {
    console.logError(e);
    throw new console.AlreadyLoggedError(e);
  }
  console.logSuccess(`Cluster ${clusterSpec.name} created successfully.`);
  return {
    clusterName: clusterSpec.name,
    launchConfigurationName: names.launchConfiguration,
    autoScalingGroupName: names.autoScalingGroup
  };
}

export async function destroy(region: string, clusterName: string) {
  let names = getResourceNames(clusterName);
  console.logInfo(
    `Deleting CloudFormation stack ${names.cloudFormationStack}...`
  );
  try {
    await stacks.deleteCloudFormationStack(region, names.cloudFormationStack);
  } catch (e) {
    console.logError(e);
    throw new console.AlreadyLoggedError(e);
  }
  console.logInfo(`✔ Deleted CloudFormation stack ${clusterName}.`);
  console.logSuccess(`Cluster ${clusterName} destroyed successfully.`);
}

export function getResourceNames(clusterName: string) {
  return {
    cloudFormationStack: "cluster-" + clusterName,
    launchConfiguration: clusterName + "-launchconfig",
    autoScalingGroup: clusterName + "-autoscalinggroup",
    instance: clusterName + "-instance"
  };
}
