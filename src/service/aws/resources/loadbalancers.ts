import * as AWS from "aws-sdk";
import * as tags from "./tags";

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
  let elb = new AWS.ELBv2({
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
    throw new Error("Load balancer could not be created.");
  }
  let loadBalancer = loadBalancerCreation.LoadBalancers[0];
  if (
    !loadBalancer.LoadBalancerArn ||
    !loadBalancer.LoadBalancerName ||
    !loadBalancer.DNSName
  ) {
    throw new Error("Load balancer is missing key properties.");
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
  let elb = new AWS.ELBv2({
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
    throw new Error("Load balancer listener could not be created.");
  }
  let listener = listenerCreation.Listeners[0];
  if (!listener.ListenerArn) {
    throw new Error("Load balancer listener is missing key properties.");
  }
  return {
    arn: listener.ListenerArn
  };
}

export async function destroyLoadBalancer(region: string, name: string) {
  let elb = new AWS.ELBv2({
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
