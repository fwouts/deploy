import * as awsLoader from "../service/aws/loader";
import * as console from "../service/console";
import * as program from "commander";
import * as regions from "../service/aws/resources/regions";

import { checkedEnvironmentAction } from "./common";

program
  .command("status")
  .description("Outputs the status of clusters and their deployments.")
  .action(
    checkedEnvironmentAction(async () => {
      let [clusters, deployments] = await Promise.all([
        awsLoader.loadClusters(),
        awsLoader.loadDeployments()
      ]);
      let clustersPerId: { [regionAndName: string]: awsLoader.Cluster } = {};
      for (let cluster of clusters) {
        clustersPerId[cluster.region + ":" + cluster.name] = cluster;
      }
      let deploymentsPerCluster: {
        [regionAndName: string]: awsLoader.Deployment[];
      } = {};
      for (let deployment of deployments) {
        let clusterId = deployment.region + ":" + deployment.clusterName;
        if (!deployment.clusterName || !clustersPerId[clusterId]) {
          // This is an orphan deployment, meaning that it is no longer deployed to a specific cluster
          // but it still has a load balancer or some other leftover resources.
          clusterId = "orphaned";
        }
        if (!deploymentsPerCluster[clusterId]) {
          deploymentsPerCluster[clusterId] = [];
        }
        deploymentsPerCluster[clusterId].push(deployment);
      }
      if (clusters.length === 0) {
        console.logInfo(`No clusters available.`);
      }
      for (let cluster of clusters) {
        console.logInfo(`\n-------------------\n`);
        let clusterId = cluster.region + ":" + cluster.name;

        console.logInfo(
          `Cluster '${cluster.name}' in ${regions.getRegionLabel(
            cluster.region
          )}:`
        );
        if (cluster.instanceType !== undefined) {
          console.logInfo(`- EC2 instance type: ${cluster.instanceType}`);
        }
        if (cluster.desiredInstanceCount !== undefined) {
          console.logInfo(
            `- Desired instance count: ${cluster.desiredInstanceCount}`
          );
        }
        if (cluster.instanceCount !== undefined) {
          console.logInfo(`- Actual instance count: ${cluster.instanceCount}`);
        }
        if (cluster.minInstanceCount !== undefined) {
          console.logInfo(
            `- Minimum instance count: ${cluster.minInstanceCount}`
          );
        }
        if (cluster.maxInstanceCount !== undefined) {
          console.logInfo(
            `- Maximum instance count: ${cluster.maxInstanceCount}`
          );
        }

        console.logInfo("");
        let deploymentsInCluster = deploymentsPerCluster[clusterId] || [];
        if (deploymentsInCluster.length === 0) {
          console.logInfo(`No deployments in cluster '${cluster.name}'.`);
        } else {
          console.logInfo(`Deployments in cluster '${cluster.name}':`);
          for (let deployment of deploymentsInCluster) {
            console.logInfo(`- ${deployment.id}: http://${deployment.dns}`);
          }
        }
      }
      if (deploymentsPerCluster["orphaned"]) {
        console.logInfo(`\n-------------------\n`);
        console.logInfo(`Orphaned deployments:`);
        for (let deployment of deploymentsPerCluster["orphaned"]) {
          console.logInfo(`- ${deployment.id}: http://${deployment.dns}`);
        }
      }
    })
  );
