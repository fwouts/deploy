import * as EC2 from "aws-sdk/clients/ec2";

import { DocumentedError } from "../../errors";

export interface Vpc {
  id: string;
  subnetIds: string[];
}

export async function getDefaultVpcAndSubnets(region: string): Promise<Vpc> {
  let ec2 = new EC2({
    region: region
  });
  let vpcsDescription = await ec2.describeVpcs().promise();
  let defaultVpc: EC2.Vpc | null = null;
  for (let vpc of vpcsDescription.Vpcs || []) {
    if (vpc.IsDefault) {
      defaultVpc = vpc;
    }
  }
  if (!defaultVpc) {
    let defaultVpcCreation = await ec2.createDefaultVpc().promise();
    if (!defaultVpcCreation.Vpc) {
      throw new DocumentedError("Default VPC could not be created.");
    }
    defaultVpc = defaultVpcCreation.Vpc;
  }
  let subnetsDescription = await ec2.describeSubnets().promise();
  let subnets = [];
  for (let subnet of subnetsDescription.Subnets || []) {
    if (subnet.VpcId === defaultVpc.VpcId) {
      subnets.push(subnet);
    }
  }
  if (!defaultVpc.VpcId) {
    throw new DocumentedError("VPC is missing key properties.");
  }
  return {
    id: defaultVpc.VpcId,
    subnetIds: subnets.map(subnet => {
      if (!subnet.SubnetId) {
        throw new DocumentedError("Subnet is missing key properties.");
      }
      return subnet.SubnetId;
    })
  };
}
