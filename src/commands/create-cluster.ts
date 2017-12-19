import * as awsCluster from "../service/aws/cluster/adhoc";
import * as inquirer from "inquirer";
import * as instanceTypes from "../service/aws/resources/instancetypes";
import * as program from "commander";

import {
  checkedEnvironmentAction,
  ensureRegionProvided,
  inputInteger,
  inputName
} from "./common";

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
        if (!name) {
          name = await inputName(
            `Please choose a name for your cluster (e.g. "staging")`
          );
        }
        let optionsWithRegion = await ensureRegionProvided(options);
        if (!optionsWithRegion.instance_type) {
          optionsWithRegion.instance_type = await inputInstanceType(
            optionsWithRegion.region
          );
        }
        if (!optionsWithRegion.instance_count) {
          optionsWithRegion.instance_count = await inputInteger(
            `How many EC2 instances should be created?`,
            1
          );
        }
        await awsCluster.createCluster({
          name: name,
          region: optionsWithRegion.region,
          ec2InstanceType: optionsWithRegion.instance_type,
          ec2InstanceCount: optionsWithRegion.instance_count
        });
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
