import * as awsDeployment from "../service/aws/deployment/adhoc";
import * as awsLoader from "../service/aws/loader";
import * as inquirer from "inquirer";
import * as program from "commander";

import { checkedEnvironmentAction, inputName } from "./common";

program
  .command("create-deployment <path-to-Dockerfile> [name]")
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
        dockerfilePath: string,
        name: string | undefined,
        options: {
          cluster?: string;
          region?: string;
          desired_count: number;
          memory: number;
          cpu?: number;
        }
      ) => {
        if (!name) {
          name = await inputName(
            `Please choose a name for your deployment (e.g. "hello")`
          );
        }
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
