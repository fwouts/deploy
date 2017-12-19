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
    "-f, --fargate",
    "Optional. Whether to use Fargate instead of starting up EC2 instances. Only available in specific regions."
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
          fargate?: boolean;
          instance_type?: string;
          instance_count?: number;
        }
      ) => {
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
        if (
          !options.instance_type &&
          !options.instance_count &&
          options.fargate === undefined &&
          regions.FARGATE_REGIONS.has(options.region)
        ) {
          // Fargate is available in this region!
          let answers = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `Fargate is available in this region. This means you don't need to start EC2 instances. Use Fargate?`
            }
          ]);
          if (answers["confirm"]) {
            options.fargate = true;
          }
        }
        if (options.fargate && !regions.FARGATE_REGIONS.has(options.region)) {
          let answers = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `As far as we know, Fargate is not available in ${
                options.region
              }. Are you sure you want to use Fargate?`
            }
          ]);
          if (!answers["confirm"]) {
            options.fargate = false;
          }
        }
        if (!options.fargate) {
          if (!options.instance_type) {
            options.instance_type = await inputInstanceType(options.region);
          }
          if (!options.instance_count) {
            options.instance_count = await inputInteger(
              `How many EC2 instances should be created?`,
              1
            );
          }
          await awsCluster.createCluster({
            name: name,
            region: options.region,
            config: {
              type: "autoscaling",
              ec2InstanceType: options.instance_type,
              ec2InstanceCount: options.instance_count
            }
          });
        } else {
          await awsCluster.createCluster({
            name: name,
            region: options.region,
            config: {
              type: "fargate"
            }
          });
        }
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
