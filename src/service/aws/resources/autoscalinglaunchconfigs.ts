import * as AWS from "aws-sdk";

const btoa = require("btoa");

const ECS_INSTANCE_ROLE_NAME = "ecsInstanceRole";

export async function createAutoScalingLaunchConfiguration(
  region: string,
  name: string,
  clusterName: string,
  instanceType: string,
  securityGroupId: string
): Promise<void> {
  let autoscaling = new AWS.AutoScaling({
    region: region
  });
  let ec2 = new AWS.EC2({
    region: region
  });
  let imagesDescription = await ec2
    .describeImages({
      Filters: [
        {
          Name: "name",
          Values: ["amzn-ami*amazon-ecs-optimized"]
        }
      ]
    })
    .promise();
  let mostRecentEcsOptimizedImage: [Date, string] | null = null;
  for (let image of imagesDescription.Images || []) {
    if (!image.CreationDate || !image.ImageId) {
      continue;
    }
    let creationDate = new Date(image.CreationDate);
    if (
      !mostRecentEcsOptimizedImage ||
      mostRecentEcsOptimizedImage[0].getTime() < creationDate.getTime()
    ) {
      mostRecentEcsOptimizedImage = [creationDate, image.ImageId];
    }
  }
  if (!mostRecentEcsOptimizedImage) {
    throw new Error("Could not find an ECS-optimised image.");
  }
  let instanceImageId = mostRecentEcsOptimizedImage[1];
  // http://docs.aws.amazon.com/AmazonECS/latest/developerguide/instance_IAM_role.html
  try {
    await autoscaling
      .createLaunchConfiguration({
        LaunchConfigurationName: name,
        InstanceType: instanceType,
        ImageId: instanceImageId,
        SecurityGroups: [securityGroupId],
        IamInstanceProfile: ECS_INSTANCE_ROLE_NAME,
        UserData: btoa(
          `#!/bin/bash
echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`
        )
      })
      .promise();
  } catch (e) {
    if (
      e.code === "ValidationError" &&
      e.message === "Invalid IamInstanceProfile: ecsInstanceRole"
    ) {
      // This is expected if the user has never used ECS before. Unfortunately, we
      // can't just create the profile for them unless they have granted IAM access,
      // which may be quite rare and we probably shouldn't encourage.
      // Instructions inspired from http://docs.aws.amazon.com/AmazonECS/latest/developerguide/instance_IAM_role.html#procedure_check_instance_role.
      throw new Error(
        `You need to create the "ecsInstanceRole" in the IAM console. Please follow these instructions:
- Open the IAM console at https://console.aws.amazon.com/iam/.
- In the navigation pane, choose Roles and then choose Create role.
- Select "EC2 Container Service" and the use case "EC2 Role for EC2 Container Service".
- In permissions, make sure the selected policy is "AmazonEC2ContainerServiceforEC2Role".
- For Role Name, type "ecsInstanceRole" and choose Create role.

Alternatively, you can access a prefilled form here: https://console.aws.amazon.com/iam/home#/roles$new?step=review&selectedService=EC2ContainerService&selectedUseCase=EC2ContainerServiceEC2Role&roleName=ecsInstanceRole
`
      );
    } else {
      throw e;
    }
  }
}

export async function destroyAutoScalingLaunchConfiguration(
  region: string,
  name: string
) {
  let autoscaling = new AWS.AutoScaling({
    region: region
  });
  let autoScalingLaunchConfigurationsDescription = await autoscaling
    .describeLaunchConfigurations({
      LaunchConfigurationNames: [name]
    })
    .promise();
  for (let autoScalingLaunchConfiguration of autoScalingLaunchConfigurationsDescription.LaunchConfigurations ||
    []) {
    if (autoScalingLaunchConfiguration.LaunchConfigurationName !== name) {
      continue;
    }
    await autoscaling
      .deleteLaunchConfiguration({
        LaunchConfigurationName:
          autoScalingLaunchConfiguration.LaunchConfigurationName
      })
      .promise();
  }
}
