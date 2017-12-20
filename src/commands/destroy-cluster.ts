import * as analytics from "../analytics";
import * as awsCluster from "../service/aws/cluster/adhoc";
import * as awsLoader from "../service/aws/loader";
import * as inquirer from "inquirer";
import * as program from "commander";

import { checkedEnvironmentAction } from "./common";

program
  .command("destroy-cluster [name]")
  .description("Destroys an existing cluster.")
  .option(
    "-r, --region <region>",
    'Optional. The region in which the cluster was set up. Example: "us-east-1".'
  )
  .action(
    checkedEnvironmentAction(
      async (name: string | undefined, options: { region?: string }) => {
        analytics.trackEvent(analytics.events.destroyClusterCommand());
        let clusters = await awsLoader.loadClusters();
        if (clusters.length === 0) {
          throw new Error(`No clusters are available.`);
        }
        let foundCluster: awsLoader.Cluster | null = null;
        if (!name) {
          let answers = await inquirer.prompt([
            {
              type: "list",
              name: "cluster",
              message: "Which cluster do you want to destroy?",
              choices: clusters.map(cluster => {
                return `${cluster.name} (${cluster.region})`;
              })
            }
          ]);
          foundCluster =
            clusters.find(cluster => {
              return (
                `${cluster.name} (${cluster.region})` === answers["cluster"]
              );
            }) || null;
        } else {
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
        }
        if (!foundCluster) {
          throw new Error(`No cluster ${name} could be found.`);
        }
        await analytics.trackCall("Destroy Cluster", () =>
          awsCluster.destroy(foundCluster!.region, foundCluster!.name)
        );
      }
    )
  );
