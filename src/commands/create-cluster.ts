import * as analytics from "../analytics";
import * as awsCluster from "../service/aws/cluster/adhoc";
import * as inquirer from "inquirer";
import * as instanceTypes from "../service/aws/resources/instancetypes";
import * as program from "commander";
import * as regions from "../service/aws/resources/regions";

import { checkedEnvironmentAction, inputInteger, inputName } from "./common";

program
  .command("create-cluster [name]")
  .description("Creates a cluster. Required to host deployments.")
  .option(
    "-r, --region <region>",
    "Optional. The region in which to set up the cluster. Prompted if not specified."
  )
  .option(
    "-t, --instance_type <instance-type>",
    "Optional. The type of instance to start. Default: t2.micro."
  )
  .option(
    "-n, --instance_count <instance-count>",
    "Optional. The number of instances to start. Default: 1.",
    parseInt
  )
  .action(
    checkedEnvironmentAction(
      async (
        name: string | undefined,
        options: {
          region?: string;
          instance_type?: string;
          instance_count?: number;
        }
      ) => {
        analytics.trackEvent(analytics.events.createClusterCommand());
        if (!name) {
          name = await inputName(
            `Please choose a name for your cluster (e.g. "staging")`,
            ""
          );
        }
        if (!options.region) {
          let answers = await inquirer.prompt([
            {
              type: "list",
              name: "region",
              message: "Which region do you want to create your cluster in?",
              choices: regions.ECS_REGIONS.map(region => {
                return `${region.id} - ${region.label}`;
              })
            }
          ]);
          [options.region] = answers["region"].split(" ");
          if (!options.region) {
            throw new Error();
          }
        }
        if (!options.instance_type) {
          options.instance_type = await inputInstanceType(options.region);
        }
        if (!options.instance_count) {
          options.instance_count = await inputInteger(
            `How many EC2 instances should be created?`,
            1
          );
        }
        await analytics.trackCall("Create Cluster", () =>
          awsCluster.createCluster({
            name: name!,
            region: options.region!,
            ec2InstanceType: options.instance_type!,
            ec2InstanceCount: options.instance_count!
          })
        );
      }
    )
  );

async function inputInstanceType(region: string): Promise<string> {
  let instanceTypesForRegion = [];
  let defaultValue = "";
  for (let instanceType of await instanceTypes.getInstanceTypes()) {
    let usdOnDemandPricePerMonth =
      instanceType.usdOnDemandPricePerMonth[region];
    if (usdOnDemandPricePerMonth === undefined) {
      continue;
    }
    let label = `${instanceType.name} (${instanceType.vcpu} vCPU, ${
      instanceType.memory
    }GB RAM) - estimated USD$${usdOnDemandPricePerMonth}/month/instance`;
    instanceTypesForRegion.push({
      type: instanceType.type,
      label: label
    });
    if (instanceType.type === "t2.micro") {
      defaultValue = label;
    }
  }
  let answers = await inquirer.prompt([
    {
      type: "list",
      name: "instance-type",
      message: "What type of EC2 instance should be started?",
      choices: instanceTypesForRegion.map(type => {
        return type.label;
      }),
      default: defaultValue
    }
  ]);
  let selectedInstanceType = instanceTypesForRegion.find(instanceType => {
    return instanceType.label === answers["instance-type"];
  });
  if (!selectedInstanceType) {
    throw new Error();
  }
  return selectedInstanceType.type;
}
