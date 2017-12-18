import * as awsCluster from "../service/aws/cluster/adhoc";
import * as program from "commander";

import {
  checkedEnvironmentAction,
  ensureRegionProvided,
  inputName
} from "./common";

program
  .command("create-cluster [name]")
  .option(
    "-r, --region <region>",
    "Optional. The region in which to set up the cluster. Prompted if not specified."
  )
  .option(
    "-t, --instance_type <instance-type>",
    "Optional. The type of instance to start. Default: t2.micro.",
    "t2.micro"
  )
  .option(
    "-n, --instance_count <instance-count>",
    "Optional. The number of instances to start. Default: 1.",
    parseInt,
    1
  )
  .action(
    checkedEnvironmentAction(
      async (
        name: string | undefined,
        options: {
          region?: string;
          instance_type: string;
          instance_count: number;
        }
      ) => {
        if (!name) {
          name = await inputName(
            `Please choose a name for your cluster (e.g. "staging")`
          );
        }
        let optionsWithRegion = await ensureRegionProvided(options);
        await awsCluster.createCluster({
          name: name,
          region: optionsWithRegion.region,
          ec2InstanceType: options.instance_type,
          ec2InstanceCount: options.instance_count
        });
      }
    )
  );
