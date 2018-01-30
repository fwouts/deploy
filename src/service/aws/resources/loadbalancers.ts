import * as ELBv2 from "aws-sdk/clients/elbv2";
import * as tags from "./tags";

import { DocumentedError } from "../../errors";

const HOURS_IN_A_MONTH = 31 * 24;

// Prices from https://aws.amazon.com/elasticloadbalancing/pricing/
// Note: all regions from regions.ts should be covered.
// Last updated on 18 Dec 2017.
export const USD_MIN_PRICE_PER_HOUR: { [region: string]: number } = {
  "us-east-2": 0.0225,
  "us-east-1": 0.0225,
  "us-west-2": 0.0225,
  "us-west-1": 0.0252,
  "ca-central-1": 0.02475,
  "eu-central-1": 0.027,
  "eu-west-2": 0.02646,
  "eu-west-1": 0.0252,
  "ap-northeast-2": 0.0225,
  "ap-northeast-1": 0.0243,
  "ap-southeast-2": 0.0252,
  "ap-southeast-1": 0.0252
};

export const USD_MIN_PRICE_PER_MONTH: { [region: string]: number } = {};
for (let [region, pricePerHour] of Object.entries(USD_MIN_PRICE_PER_HOUR)) {
  USD_MIN_PRICE_PER_MONTH[region] =
    Math.round(pricePerHour * HOURS_IN_A_MONTH * 100) / 100;
}

export interface LoadBalancer {
  arn: string;
  name: string;
  dns: string;
}

export async function createLoadBalancer(
  region: string,
  name: string,
  subnetIds: string[],
  elbSecurityGroupId: string,
  tags: tags.Tag[]
): Promise<LoadBalancer> {
  let elb = new ELBv2({
    region: region
  });
  let loadBalancerCreation = await elb
    .createLoadBalancer({
      Name: name,
      Type: "application",
      Subnets: subnetIds,
      SecurityGroups: [elbSecurityGroupId],
      Tags: tags
    })
    .promise();
  if (
    !loadBalancerCreation.LoadBalancers ||
    loadBalancerCreation.LoadBalancers.length !== 1
  ) {
    throw new DocumentedError("Load balancer could not be created.");
  }
  let loadBalancer = loadBalancerCreation.LoadBalancers[0];
  if (
    !loadBalancer.LoadBalancerArn ||
    !loadBalancer.LoadBalancerName ||
    !loadBalancer.DNSName
  ) {
    throw new DocumentedError("Load balancer is missing key properties.");
  }
  return {
    arn: loadBalancer.LoadBalancerArn,
    name: loadBalancer.LoadBalancerName,
    dns: loadBalancer.DNSName
  };
}

export interface Listener {
  arn: string;
}

export async function createListener(
  region: string,
  loadBalancerArn: string,
  loadBalancerPort: number,
  targetGroupArn: string
): Promise<Listener> {
  let elb = new ELBv2({
    region: region
  });
  let listenerCreation = await elb
    .createListener({
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTP",
      Port: loadBalancerPort,
      DefaultActions: [
        {
          Type: "forward",
          TargetGroupArn: targetGroupArn
        }
      ]
    })
    .promise();
  if (!listenerCreation.Listeners || listenerCreation.Listeners.length !== 1) {
    throw new DocumentedError("Load balancer listener could not be created.");
  }
  let listener = listenerCreation.Listeners[0];
  if (!listener.ListenerArn) {
    throw new DocumentedError(
      "Load balancer listener is missing key properties."
    );
  }
  return {
    arn: listener.ListenerArn
  };
}

export async function destroyLoadBalancer(region: string, name: string) {
  let elb = new ELBv2({
    region: region
  });
  let loadBalancersDescription = await elb
    .describeLoadBalancers({
      Names: [name]
    })
    .promise();
  for (let loadBalancer of loadBalancersDescription.LoadBalancers || []) {
    if (
      !loadBalancer.LoadBalancerArn ||
      loadBalancer.LoadBalancerName !== name
    ) {
      continue;
    }
    let listenersDescription = await elb
      .describeListeners({
        LoadBalancerArn: loadBalancer.LoadBalancerArn
      })
      .promise();
    for (let listener of listenersDescription.Listeners || []) {
      if (!listener.ListenerArn) {
        continue;
      }
      await elb
        .deleteListener({
          ListenerArn: listener.ListenerArn
        })
        .promise();
    }
    await elb
      .deleteLoadBalancer({
        LoadBalancerArn: loadBalancer.LoadBalancerArn
      })
      .promise();
  }
}
