import "source-map-support/register";

import * as awsAuth from "./service/aws/auth";
import * as awsCluster from "./service/aws/cluster/adhoc";
import * as awsDeployment from "./service/aws/deployment/adhoc";
import * as awsLoader from "./service/aws/loader";
import * as console from "./service/console";
import * as docker from "./service/docker";
import * as inquirer from "inquirer";
import * as program from "commander";
import * as regions from "./service/aws/resources/regions";

// TODO: Make sure this stays in sync with package.json.
const VERSION = "0.0.4";

program.version(VERSION);

function checkedEnvironmentAction(f: (...args: any[]) => Promise<any>) {
  async function checked(...args: any[]) {
    await awsAuth.authenticate();
    await docker.checkEnvironment();
    await f(...args);
  }
  return (...args: any[]) => {
    checked(...args)
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
  checkedEnvironmentAction(async () => {
    let clusters = await awsLoader.loadClusters();
    console.logInfo(JSON.stringify(clusters, null, 2));
  })
);

program
  .command("create-cluster <name>")
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
        name: string,
        options: {
          region?: string;
          instance_type: string;
          instance_count: number;
        }
      ) => {
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

program
  .command("destroy-cluster <name>")
  .option(
    "-r, --region <region>",
    'Optional. The region in which the cluster was set up. Example: "us-east-1".'
  )
  .action(
    checkedEnvironmentAction(
      async (name: string, options: { region?: string }) => {
        let clusters = await awsLoader.loadClusters();
        let foundCluster = null;
        for (let cluster of clusters) {
          if (options.region && cluster.region !== options.region) {
            continue;
          }
          if (cluster.name === name) {
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
          throw new Error(`No cluster ${name} could be found.`);
        }
        await awsCluster.destroy(foundCluster.region, foundCluster.name);
      }
    )
  );

program.command("list-deployments").action(
  checkedEnvironmentAction(async () => {
    let deployments = await awsLoader.loadDeployments();
    console.logInfo(JSON.stringify(deployments, null, 2));
  })
);

program
  .command("create-deployment <name> <path-to-Dockerfile>")
  .option(
    "-c, --cluster <cluster>",
    "Optional. The name of the cluster in which to deploy."
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
    checkedEnvironmentAction(
      async (
        name: string,
        dockerfilePath: string,
        options: {
          cluster?: string;
          region?: string;
          desired_count: number;
          memory: number;
          cpu?: number;
        }
      ) => {
        let clusters = await awsLoader.loadClusters();
        let foundCluster = null;
        if (!options.cluster) {
          // TODO: Also offer to create a new cluster.
          let answers = await inquirer.prompt([
            {
              type: "list",
              name: "cluster",
              message: "Which cluster do you want to deploy in?",
              choices: clusters.map(cluster => {
                return `${cluster.name} (${cluster.region})`;
              })
            }
          ]);
          foundCluster = clusters.find(cluster => {
            return `${cluster.name} (${cluster.region})` === answers["cluster"];
          });
        } else {
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
    checkedEnvironmentAction(
      async (name: string, options: { region: string }) => {
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
      }
    )
  );

program.command("*").action(cmd => {
  console.logError(`Unknown command: ${cmd}.`);
  process.exit(1);
});

async function ensureRegionProvided<T extends { region?: string }>(
  options: T
): Promise<
  T & {
    region: string;
  }
> {
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
  return options as any;
}

program.parse(process.argv);
