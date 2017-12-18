import * as awsCluster from "../service/aws/cluster/adhoc";
import * as awsLoader from "../service/aws/loader";
import * as program from "commander";

import { checkedEnvironmentAction } from "./common";

program
  .command("destroy-cluster [name]")
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
