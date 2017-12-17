import "source-map-support/register";

import * as awsAuth from "./service/aws/auth";
import * as awsCluster from "./service/aws/cluster/adhoc";
import * as awsDeployment from "./service/aws/deployment/adhoc";
import * as awsLoader from "./service/aws/loader";
import * as console from "./service/console";
import * as program from "commander";

// TODO: Make sure this stays in sync with package.json.
const VERSION = "0.0.4";

program.version(VERSION);

function asyncAction(f: (...args: any[]) => Promise<any>) {
  return (...args: any[]) => {
    f(...args)
      .catch(error => {
        console.logError(error);
        process.exit(1);
      })
      .then(() => {
        process.exit(0);
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
    "Optional. The region in which to set up the cluster. Default: us-east-1.",
    "us-east-1"
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
    'Required. The region in which the cluster was set up. Example: "us-east-1".'
  )
  .action(
    asyncAction(async (name: string, options: { region: string }) => {
      await awsAuth.authenticate();
      await awsCluster.destroy(options.region, name);
    })
  );

program.command("list-deployments").action(
  asyncAction(async () => {
    await awsAuth.authenticate();
    let deployments = await awsLoader.loadDeployments();
    console.logInfo(JSON.stringify(deployments, null, 2));
  })
);

program
  .command("create-deployment <name> <path-to-Dockerfile>")
  .option(
    "-c, --cluster <cluster>",
    "Required. The name of the cluster in which to deploy."
  )
  .option(
    "-r, --region <region>",
    "Optional. The region in which to deploy (if several clusters share the same name)."
  )
  .option(
    "-n, --desired_count <desired-count>",
    "Optional. The number of Docker containers you wish to run. Default: 1.",
    parseInt,
    1
  )
  .option(
    "--memory <memory>",
    "Optional. The amount of memory (in MB) to allocate per container. Default: 512.",
    parseInt,
    512
  )
  .option(
    "--cpu <cpu-units>",
    "Optional. The amount of CPU units (1024 = 1 vCPU) to allocate per container. No default.",
    parseInt
  )
  .action(
    asyncAction(
      async (
        name: string,
        dockerfilePath: string,
        options: {
          cluster: string;
          region?: string;
          desired_count: number;
          memory: number;
          cpu?: number;
        }
      ) => {
        if (!options.cluster) {
          throw new Error(
            `Please specify a cluster to create the deployment in.`
          );
        }
        await awsAuth.authenticate();
        let clusters = await awsLoader.loadClusters();
        let foundCluster = null;
        for (let cluster of clusters) {
          if (options.region && cluster.region !== options.region) {
            continue;
          }
          if (cluster.name === options.cluster) {
            if (foundCluster) {
              if (options.region) {
                // This should never happen, actually. AWS does not allow several clusters with the same name in the same region.
                throw new Error(
                  `There are several clusters named ${
                    cluster.name
                  } in the region ${options.region}.`
                );
              } else {
                throw new Error(
                  `There are several clusters named ${
                    cluster.name
                  }. Please use --region to limit results.`
                );
              }
            }
            foundCluster = cluster;
          }
        }
        if (!foundCluster) {
          throw new Error(`No cluster ${options.cluster} could be found.`);
        }
        await awsDeployment.deploy(
          {
            name: name,
            cluster: foundCluster,
            container: {
              imageSource: {
                type: "local",
                dockerfilePath: dockerfilePath
              },
              memory: options.memory,
              cpuUnits: options.cpu
            },
            desiredCount: options.desired_count,
            // TODO: Add support for environment.
            environment: {}
          },
          name
        );
      }
    )
  );

program
  .command("destroy-deployment <name>")
  .option(
    "-r, --region <region>",
    "Optional. The region in which the deployment was created."
  )
  .action(
    asyncAction(async (name: string, options: { region: string }) => {
      await awsAuth.authenticate();
      let deployments = await awsLoader.loadDeployments();
      let foundDeployment = null;
      for (let deployment of deployments) {
        if (options.region && deployment.region !== options.region) {
          continue;
        }
        if (deployment.id === name) {
          if (foundDeployment) {
            if (options.region) {
              // This should never happen, but you never know.
              throw new Error(
                `There are several deployments named ${name} in the region ${
                  options.region
                }.`
              );
            } else {
              throw new Error(
                `There are several deployments named ${name}. Please use --region to limit results.`
              );
            }
          }
          foundDeployment = deployment;
        }
      }
      if (!foundDeployment) {
        throw new Error(`No deployment ${name} could be found.`);
      }
      await awsDeployment.destroy(
        foundDeployment.region,
        foundDeployment.clusterName,
        foundDeployment.id
      );
    })
  );

program.command("*").action(cmd => {
  console.logError(`Unknown command: ${cmd}.`);
  process.exit(1);
});

program.parse(process.argv);
