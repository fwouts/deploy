import * as clusters from "../resources/clusters";
import * as console from "../../console";
import * as deployModel from "../../deploymodel";
import * as docker from "../../docker";
import * as repositories from "../resources/repositories";
import * as securityGroups from "../resources/securitygroups";
import * as stacks from "../resources/stacks";
import * as tags from "../resources/tags";
import * as vpcs from "../resources/vpcs";

import { AWS } from "cloudformation-declarations";
import { getResourceNames } from "./names";

export interface DeployResult {
  deploymentId: string;
  repositoryName: string;
  repositoryImageTag: string;
}

export async function deploy(
  deploymentSpec: deployModel.DeploymentSpec,
  deploymentId: string
): Promise<DeployResult> {
  let names = getResourceNames(deploymentId);
  let deploymentTags = [
    tags.SHARED_TAG,
    tags.clusterNameTag(deploymentSpec.cluster.name),
    tags.deploymentIdTag(deploymentId)
  ];
  let cluster: clusters.Cluster | undefined;
  let dockerImagePushed = false;

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

    console.logInfo(
      `Creating CloudFormation stack ${names.cloudFormationStack}...`
    );
    try {
      let loadBalancerSecurityGroup: AWS.EC2.SecurityGroup = {
        Type: "AWS::EC2::SecurityGroup",
        Properties: {
          GroupName: names.loadBalancerSecurityGroup,
          GroupDescription: "Security group for ELB.",
          VpcId: vpc.id,
          Tags: deploymentTags
        }
      };
      let loadBalancerSecurityGroupIngressFromDefaultSecurityGroup: AWS.EC2.SecurityGroupIngress = {
        Type: "AWS::EC2::SecurityGroupIngress",
        Properties: {
          GroupId: {
            Ref: "loadBalancerSecurityGroup"
          } as any,
          IpProtocol: "TCP",
          FromPort: "0",
          ToPort: "65535",
          SourceSecurityGroupId: defaultSecurityGroupId
        }
      };
      let loadBalancerSecurityGroupIngressFromOutside: AWS.EC2.SecurityGroupIngress = {
        Type: "AWS::EC2::SecurityGroupIngress",
        Properties: {
          GroupId: {
            Ref: "loadBalancerSecurityGroup"
          } as any,
          IpProtocol: "TCP",
          FromPort: loadBalancerPort.toString(10),
          ToPort: loadBalancerPort.toString(10),
          CidrIp: "0.0.0.0/0"
        }
      };
      let defaultSecurityGroupIngressFromLoadBalancer: AWS.EC2.SecurityGroupIngress = {
        Type: "AWS::EC2::SecurityGroupIngress",
        Properties: {
          GroupId: defaultSecurityGroupId,
          IpProtocol: "TCP",
          FromPort: "0",
          ToPort: "65535",
          SourceSecurityGroupId: {
            Ref: "loadBalancerSecurityGroup"
          } as any
        }
      };
      let loadBalancer: AWS.ElasticLoadBalancingV2.LoadBalancer = {
        Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        Properties: {
          Name: names.loadBalancer,
          Type: "application",
          Subnets: vpc.subnetIds,
          SecurityGroups: [
            {
              Ref: "loadBalancerSecurityGroup"
            } as any
          ],
          Tags: deploymentTags
        }
      };
      let environmentVariables: AWS.ECS.TaskDefinition.KeyValuePair[] = [];
      for (let [key, value] of Object.entries(deploymentSpec.environment)) {
        environmentVariables.push({
          Name: key,
          Value: value
        });
      }
      let taskDefinition: AWS.ECS.TaskDefinition = {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: names.taskDefinition,
          ContainerDefinitions: [
            {
              Name: names.container,
              Image: repository.uri + ":" + names.remoteDockerImageTag,
              Memory: deploymentSpec.container.memory.toString(10),
              Cpu: deploymentSpec.container.cpuUnits
                ? deploymentSpec.container.cpuUnits.toString(10)
                : "",
              PortMappings: [
                {
                  HostPort: "0",
                  ContainerPort: dockerImageExposedPort.toString(10)
                }
              ],
              Environment: environmentVariables
            }
          ]
        }
      };
      let targetGroup: AWS.ElasticLoadBalancingV2.TargetGroup = {
        Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
        Properties: {
          Name: names.targetGroup,
          Protocol: "HTTP",
          Port: loadBalancerPort.toString(10),
          VpcId: vpc.id,
          Tags: deploymentTags
        }
      };
      let loadBalancerListener: AWS.ElasticLoadBalancingV2.Listener = {
        Type: "AWS::ElasticLoadBalancingV2::Listener",
        Properties: {
          LoadBalancerArn: {
            Ref: "loadBalancer"
          } as any,
          Protocol: "HTTP",
          Port: loadBalancerPort.toString(10),
          DefaultActions: [
            {
              Type: "forward",
              TargetGroupArn: {
                Ref: "targetGroup"
              } as any
            }
          ]
        }
      };
      let service: AWS.ECS.Service = {
        Type: "AWS::ECS::Service",
        Properties: {
          Cluster: cluster.arn,
          ServiceName: names.service,
          TaskDefinition: {
            Ref: "taskDefinition"
          } as any,
          DesiredCount: deploymentSpec.desiredCount.toString(10),
          LoadBalancers: [
            {
              TargetGroupArn: {
                Ref: "targetGroup"
              } as any,
              ContainerName: names.container,
              ContainerPort: dockerImageExposedPort.toString(10)
            }
          ]
        }
      };
      let cloudFormationTemplate = {
        AWSTemplateFormatVersion: "2010-09-09",
        Resources: {
          loadBalancerSecurityGroup,
          loadBalancerSecurityGroupIngressFromDefaultSecurityGroup,
          loadBalancerSecurityGroupIngressFromOutside,
          defaultSecurityGroupIngressFromLoadBalancer,
          loadBalancer,
          taskDefinition,
          targetGroup,
          loadBalancerListener,
          service: {
            ...service,
            DependsOn: "loadBalancerListener"
          }
        }
      };
      await stacks.createCloudFormationStack(
        deploymentSpec.cluster.region,
        names.cloudFormationStack,
        cloudFormationTemplate
      );
    } catch (e) {
      console.logError(e);
      throw new console.AlreadyLoggedError(e);
    }
    console.logSuccess(
      `Created CloudFormation stack ${names.cloudFormationStack}.`
    );

    return {
      deploymentId,
      repositoryName: names.repository,
      repositoryImageTag: names.remoteDockerImageTag
    };
  } catch (e) {
    console.logError(e);
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
  clusterName: string,
  deploymentId: string
) {
  let names = getResourceNames(deploymentId);
  console.logInfo(
    `Deleting CloudFormation stack ${names.cloudFormationStack}...`
  );
  try {
    await stacks.deleteCloudFormationStack(region, names.cloudFormationStack);
  } catch (e) {
    console.logError(e);
    throw new console.AlreadyLoggedError(e);
  }
  console.logInfo(
    `✔ Deleted CloudFormation stack ${names.cloudFormationStack}.`
  );
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
  console.logSuccess(`Destroyed deployment ${deploymentId} successfully.`);
}
