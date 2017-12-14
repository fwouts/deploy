import "source-map-support/register";

import * as awsAuth from "./service/aws/auth";
import * as awsCluster from "./service/aws/cluster/adhoc";
import * as awsLoader from "./service/aws/loader";
import * as console from "./service/console";
import * as program from "commander";

// TODO: Make sure this stays in sync with package.json.
const VERSION = "0.0.4";

program.version(VERSION);

function asyncAction(f: (...args: any[]) => Promise<any>) {
  return (...args: any[]) => {
    f(...args).catch(error => {
      console.logError(error);
    });
  };
}

program.command("list-clusters").action(
  asyncAction(async () => {
    await awsAuth.authenticate();
    let clusters = await awsLoader.loadClusters();
    console.logInfo(JSON.stringify(clusters, null, 2));
  })
);

program
  .command("create-cluster <name>")
  .option(
    "-r, --region <region>",
    'The region in which to set up the cluster. Example: "us-east-1".',
    "us-east-1"
  )
  .option(
    "-t, --instance_type <instance-type>",
    'The type of instance to start. Example: "t2.micro".',
    "t2.micro"
  )
  .option(
    "-c, --instance_count <instance-count>",
    "The number of instances to start. Example: 1.",
    parseInt,
    1
  )
  .action(
    asyncAction(
      async (
        name: string,
        options: {
          region: string;
          instance_type: string;
          instance_count: number;
        }
      ) => {
        await awsAuth.authenticate();
        await awsCluster.createCluster({
          name: name,
          region: options.region,
          ec2InstanceType: options.instance_type,
          ec2InstanceCount: options.instance_count
        });
      }
    )
  );

program
  .command("destroy-cluster <name>")
  .option(
    "-r, --region <region>",
    'The region in which the cluster was set up. Example: "us-east-1".',
    "us-east-1"
  )
  .action(
    asyncAction(async (name: string, options: { region: string }) => {
      await awsAuth.authenticate();
      await awsCluster.destroy(options.region, name);
    })
  );

program.command("*").action(cmd => {
  console.logError(`Unknown command: ${cmd}.`);
});

program.parse(process.argv);
