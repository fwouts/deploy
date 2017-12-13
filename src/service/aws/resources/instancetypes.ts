import axios, { AxiosResponse } from "axios";

export interface InstanceType {
  type: string;
  name: string;
  memory: number;
  vcpu: number;
  usdOnDemandPricePerMonth: { [region: string]: number };
}

const HOURS_IN_A_MONTH = 31 * 24;

export async function getInstanceTypes(): Promise<InstanceType[]> {
  let response: AxiosResponse<Ec2InstanceTypes> = await axios.get(
    "https://www.ec2instances.info/instances.json"
  );
  let instanceTypes = [];
  for (let ec2InstanceType of response.data) {
    if (ec2InstanceType.generation !== "current") {
      continue;
    }
    let usdOnDemandPricePerMonth: { [region: string]: number } = {};
    for (let [region, pricing] of Object.entries(ec2InstanceType.pricing)) {
      if (!pricing.linux) {
        continue;
      }
      usdOnDemandPricePerMonth[region] =
        Math.round(
          parseFloat(pricing.linux.ondemand) * HOURS_IN_A_MONTH * 100
        ) / 100;
    }
    instanceTypes.push({
      type: ec2InstanceType.instance_type,
      name: ec2InstanceType.pretty_name,
      memory: ec2InstanceType.memory,
      vcpu: ec2InstanceType.vCPU,
      usdOnDemandPricePerMonth: usdOnDemandPricePerMonth
    });
  }
  return instanceTypes;
}

type Ec2InstanceTypes = Ec2InstanceType[];

interface Ec2InstanceType {
  // Multiple fields are omitted.
  generation: "previous" | "current";
  instance_type: string;
  pretty_name: string;
  memory: number;
  vCPU: number;
  pricing: {
    [region: string]: {
      linux?: {
        ondemand: string; // floating point number
      };
    };
  };
}
