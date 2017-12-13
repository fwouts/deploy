import * as EC2 from "aws-sdk/clients/ec2";

export async function getDefaultSecurityGroupId(region: string, vpcId: string) {
  let ec2 = new EC2({
    region: region
  });
  // It's not possible to create a custom security group with the name "default", and it's
  // not possible to delete the "default" security group, so there should always be a match.
  let defaultSecurityGroupDescription = await ec2
    .describeSecurityGroups({
      GroupNames: ["default"]
    })
    .promise();
  if (
    !defaultSecurityGroupDescription.SecurityGroups ||
    defaultSecurityGroupDescription.SecurityGroups.length !== 1
  ) {
    throw new Error("Default security group could not be resolved.");
  }
  let securityGroup = defaultSecurityGroupDescription.SecurityGroups[0];
  if (!securityGroup.GroupId) {
    throw new Error("Default security group is missing key properties.");
  }
  return securityGroup.GroupId;
}
