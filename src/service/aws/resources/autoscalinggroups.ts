import * as AutoScaling from "aws-sdk/clients/autoscaling";
import * as EC2 from "aws-sdk/clients/ec2";
import * as tags from "./tags";

export async function createAutoScalingGroup(
  region: string,
  name: string,
  launchConfigurationName: string,
  instanceName: string,
  minInstanceCount: number,
  maxInstanceCount: number,
  subnetIds: string[],
  tags: tags.Tag[]
): Promise<void> {
  let autoscaling = new AutoScaling({
    region: region
  });
  await autoscaling
    .createAutoScalingGroup({
      AutoScalingGroupName: name,
      LaunchConfigurationName: launchConfigurationName,
      MinSize: minInstanceCount,
      MaxSize: maxInstanceCount,
      VPCZoneIdentifier: subnetIds.join(","),
      Tags: [
        {
          Key: "Name",
          Value: instanceName,
          PropagateAtLaunch: true
        },
        ...tags.map(tag => {
          return {
            ...tag,
            PropagateAtLaunch: true
          };
        })
      ]
    })
    .promise();
}

export async function destroyAutoScalingGroup(region: string, name: string) {
  let autoscaling = new AutoScaling({
    region: region
  });
  let ec2 = new EC2({
    region: region
  });
  let autoScalingGroupsDescription = await autoscaling
    .describeAutoScalingGroups({
      AutoScalingGroupNames: [name]
    })
    .promise();
  for (let autoScalingGroup of autoScalingGroupsDescription.AutoScalingGroups ||
    []) {
    if (autoScalingGroup.AutoScalingGroupName !== name) {
      continue;
    }
    await autoscaling
      .updateAutoScalingGroup({
        AutoScalingGroupName: autoScalingGroup.AutoScalingGroupName,
        MinSize: 0,
        MaxSize: 0,
        DesiredCapacity: 0
      })
      .promise();
    if (autoScalingGroup.Instances && autoScalingGroup.Instances.length > 0) {
      await ec2
        .terminateInstances({
          InstanceIds: autoScalingGroup.Instances.map(
            instance => instance.InstanceId
          )
        })
        .promise();
    }
    await autoscaling
      .deleteAutoScalingGroup({
        AutoScalingGroupName: autoScalingGroup.AutoScalingGroupName,
        ForceDelete: true
      })
      .promise();
  }
}
