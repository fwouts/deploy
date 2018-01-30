import * as ELBv2 from "aws-sdk/clients/elbv2";
import * as tags from "./tags";

import { DocumentedError } from "../../errors";

export interface TargetGroup {
  arn: string;
  name: string;
}

export async function createTargetGroup(
  region: string,
  name: string,
  vpcId: string,
  allocatedLoadBalancerPort: number,
  tags: tags.Tag[]
): Promise<TargetGroup> {
  let elb = new ELBv2({
    region: region
  });
  let targetGroupCreation = await elb
    .createTargetGroup({
      Name: name,
      Protocol: "HTTP",
      Port: allocatedLoadBalancerPort,
      VpcId: vpcId
    })
    .promise();
  if (
    !targetGroupCreation.TargetGroups ||
    targetGroupCreation.TargetGroups.length !== 1
  ) {
    throw new DocumentedError("Target group could not be created.");
  }
  let targetGroup = targetGroupCreation.TargetGroups[0];
  if (!targetGroup.TargetGroupArn || !targetGroup.TargetGroupName) {
    throw new DocumentedError("Target group is missing key properties.");
  }
  await elb
    .addTags({
      ResourceArns: [targetGroup.TargetGroupArn],
      Tags: tags
    })
    .promise();
  return {
    arn: targetGroup.TargetGroupArn,
    name: targetGroup.TargetGroupName
  };
}

export async function deleteTargetGroup(region: string, name: string) {
  let elb = new ELBv2({
    region: region
  });
  let targetGroupsDescription = await elb
    .describeTargetGroups({
      Names: [name]
    })
    .promise();
  for (let targetGroup of targetGroupsDescription.TargetGroups || []) {
    if (!targetGroup.TargetGroupArn || targetGroup.TargetGroupName !== name) {
      continue;
    }
    await elb
      .deleteTargetGroup({
        TargetGroupArn: targetGroup.TargetGroupArn
      })
      .promise();
  }
}
