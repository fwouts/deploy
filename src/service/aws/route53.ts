import * as ELBv2 from "aws-sdk/clients/elbv2";
import * as Route53 from "aws-sdk/clients/route53";
import * as console from "../console";

export async function map(
  region: string,
  deploymentId: string,
  domain: string,
  subdomain: string | "@"
): Promise<void> {
  let route53 = new Route53();
  let hostedZonesList = await route53
    .listHostedZonesByName({
      DNSName: domain
    })
    .promise();
  if (hostedZonesList.HostedZones.length === 0) {
    throw new Error("No hosted zone in Route 53 for: " + domain);
  }
  let hostedZoneId = hostedZonesList.HostedZones[0].Id;
  let elbName = deploymentId + "-loadbalancer";
  let elb = new ELBv2({
    region: region
  });
  let loadBalancersDescription = await elb
    .describeLoadBalancers({
      Names: [elbName]
    })
    .promise();
  if (
    !loadBalancersDescription.LoadBalancers ||
    loadBalancersDescription.LoadBalancers.length === 0
  ) {
    throw new Error("No load balancer found for deployment: " + deploymentId);
  }
  let loadBalancer = loadBalancersDescription.LoadBalancers[0];
  if (!loadBalancer.DNSName || !loadBalancer.CanonicalHostedZoneId) {
    throw new Error("Load balancer is missing key properties.");
  }
  await route53
    .changeResourceRecordSets({
      ChangeBatch: {
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: {
              Name: (subdomain === "@" ? "" : subdomain + ".") + domain + ".",
              Type: "A",
              AliasTarget: {
                DNSName: "dualstack." + loadBalancer.DNSName,
                HostedZoneId: loadBalancer.CanonicalHostedZoneId,
                EvaluateTargetHealth: true
              }
            }
          }
        ]
      },
      HostedZoneId: hostedZoneId
    })
    .promise();
  console.logInfo(`Route 53 record set updated.`);
}
