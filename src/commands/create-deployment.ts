import * as awsDeployment from "../service/aws/deployment/adhoc";
import * as awsLoader from "../service/aws/loader";
import * as console from "../service/console";
import * as inquirer from "inquirer";
import * as loadBalancers from "../service/aws/resources/loadbalancers";
import * as program from "commander";
import * as regions from "../service/aws/resources/regions";

import { checkedEnvironmentAction, inputInteger, inputName } from "./common";

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
    parseInt
  )
  .option(
    "--memory <memory>",
    "Optional. The amount of memory (in MB) to allocate per container. Default: 512.",
    parseInt
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
        let clusters = await awsLoader.loadClusters();
        if (clusters.length === 0) {
          throw new Error(
            `No clusters are available. Please create one first.`
          );
        }
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
        if (loadBalancers.USD_MIN_PRICE_PER_MONTH[foundCluster.region]) {
          let regionLabel = regions.getRegionLabel(foundCluster.region);
          console.logInfo(
            `Each deployment comes with its own application load balancer. In the region ${regionLabel}, it may cost a minimum of USD$${
              loadBalancers.USD_MIN_PRICE_PER_MONTH[foundCluster.region]
            }/month. For more information, see https://aws.amazon.com/elasticloadbalancing/pricing.`
          );
        }
        if (!name) {
          name = await inputName(
            `Please choose a name for your deployment (e.g. "hello")`
          );
        }
        if (!options.desired_count) {
          options.desired_count = await inputInteger(
            "How many Docker containers should be deployed?",
            1
          );
        }
        if (!options.memory) {
          options.memory = await inputInteger(
            "How much memory should be allocated to each container (in MB)?",
            512
          );
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
