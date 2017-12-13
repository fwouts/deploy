import * as EC2 from "aws-sdk/clients/ec2";
import * as tags from "./tags";

export interface SecurityGroup {
  id: string;
}

export async function createLoadBalancerSecurityGroup(
  region: string,
  name: string,
  vpcId: string,
  tags: tags.Tag[]
): Promise<SecurityGroup> {
  let ec2 = new EC2({
    region: region
  });
  let securityGroup = await ec2
    .createSecurityGroup({
      GroupName: name,
      VpcId: vpcId,
      Description: "Security group for ELB."
    })
    .promise();
  if (!securityGroup.GroupId) {
    throw new Error("ELB security group could not be created.");
  }
  await ec2
    .createTags({
      Resources: [securityGroup.GroupId],
      Tags: tags
    })
    .promise();
  return {
    id: securityGroup.GroupId
  };
}

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

export async function configureSecurityGroups(
  region: string,
  elbSecurityGroupId: string,
  defaultSecurityGroupId: string,
  publicLoadBalancerPorts: number[]
): Promise<void> {
  let ec2 = new EC2({
    region: region
  });
  // Configuration of the ELB security group, used by the load balancer.
  // The load balancer is used for two things:
  // 1. serve public requests through any service's exposed port (if there is one);
  // 2. serve internal requests from a service to another service (inaccessible to the public).
  await ec2
    .authorizeSecurityGroupIngress({
      GroupId: elbSecurityGroupId,
      IpPermissions: [
        {
          IpProtocol: "TCP",
          FromPort: 0,
          ToPort: 65535,
          UserIdGroupPairs: [
            {
              GroupId: defaultSecurityGroupId
            }
          ]
        },
        ...publicLoadBalancerPorts.map(publicLoadBalancerPort => {
          return {
            IpProtocol: "TCP",
            FromPort: publicLoadBalancerPort,
            ToPort: publicLoadBalancerPort,
            IpRanges: [
              {
                CidrIp: "0.0.0.0/0"
              }
            ]
          };
        })
      ]
    })
    .promise();

  // Configuration of the default security group, shared by all EC2 instances.
  // Allow any traffic coming from ELB. Note that we don't need to allow any traffic coming from ECS
  // since it will always come through ELB.
  await ec2
    .authorizeSecurityGroupIngress({
      GroupId: defaultSecurityGroupId,
      IpPermissions: [
        {
          IpProtocol: "-1",
          UserIdGroupPairs: [
            {
              GroupId: elbSecurityGroupId
            }
          ]
        }
      ]
    })
    .promise();
}

export async function deleteLoadBalancerSecurityGroup(
  region: string,
  name: string
) {
  await deleteNetworkInterfacesForSecurityGroup(region, name);
  let ec2 = new EC2({
    region: region
  });
  let securityGroupsDescription = await ec2
    .describeSecurityGroups({
      GroupNames: [name]
    })
    .promise();
  for (let securityGroup of securityGroupsDescription.SecurityGroups || []) {
    if (
      !securityGroup.GroupId ||
      !securityGroup.VpcId ||
      securityGroup.GroupName !== name
    ) {
      continue;
    }
    let defaultSecurityGroupId = await getDefaultSecurityGroupId(
      region,
      securityGroup.VpcId
    );
    await ec2
      .revokeSecurityGroupIngress({
        GroupId: defaultSecurityGroupId,
        IpPermissions: [
          {
            IpProtocol: "-1",
            UserIdGroupPairs: [
              {
                GroupId: securityGroup.GroupId
              }
            ]
          }
        ]
      })
      .promise();
    // Unfortunately, just doing ec2.revokeSecurityGroupIngress({
    //   GroupId: securityGroup.GroupId,
    //   IpPermissions: securityGroup.IpPermissions
    // }) does not work.
    for (let ipPermission of securityGroup.IpPermissions || []) {
      for (let userIdGroupPair of ipPermission.UserIdGroupPairs || []) {
        await ec2
          .revokeSecurityGroupIngress({
            GroupId: securityGroup.GroupId,
            IpPermissions: [
              {
                IpProtocol: "TCP",
                FromPort: 0,
                ToPort: 65535,
                UserIdGroupPairs: [
                  {
                    GroupId: userIdGroupPair.GroupId
                  }
                ]
              }
            ]
          })
          .promise();
      }
    }
  }
  for (let securityGroup of securityGroupsDescription.SecurityGroups || []) {
    if (!securityGroup.GroupId || securityGroup.GroupName !== name) {
      continue;
    }
    await ec2
      .deleteSecurityGroup({
        GroupId: securityGroup.GroupId
      })
      .promise();
  }
}

async function deleteNetworkInterfacesForSecurityGroup(
  region: string,
  securityGroupName: string
) {
  let ec2 = new EC2({
    region: region
  });
  let mustWait: boolean;
  do {
    mustWait = false;
    let networkInterfacesDescription = await ec2
      .describeNetworkInterfaces()
      .promise();
    for (let networkInterface of networkInterfacesDescription.NetworkInterfaces ||
      []) {
      if (!networkInterface.NetworkInterfaceId) {
        continue;
      }
      for (let securityGroupIdentifier of networkInterface.Groups || []) {
        if (securityGroupIdentifier.GroupName === securityGroupName) {
          // We need to wait for this network interface to go away before we can delete the
          // security groups.
          mustWait = true;
          // If the network interface is not attached, then try to delete it right away.
          // Note that we can't simply detach it otherwise. AWS won't let us.
          if (!networkInterface.Attachment) {
            try {
              await ec2
                .deleteNetworkInterface({
                  NetworkInterfaceId: networkInterface.NetworkInterfaceId
                })
                .promise();
            } catch (e) {
              // This is fine. AWS may have already deleted it for us.
            }
          }
        }
      }
    }
    if (mustWait) {
      // Wait for two seconds.
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } while (mustWait);
}
