import * as awsDeployment from "../service/aws/deployment/adhoc";
import * as awsLoader from "../service/aws/loader";
import * as inquirer from "inquirer";
import * as program from "commander";
import * as regions from "../service/aws/resources/regions";

import { checkedEnvironmentAction } from "./common";

program
  .command("kill [name]")
  .description("Destroys an existing deployment.")
  .option(
    "-r, --region <region>",
    "Optional. The region in which the deployment was created."
  )
  .action(
    checkedEnvironmentAction(
      async (name: string | undefined, options: { region: string }) => {
        let deployments = await awsLoader.loadDeployments();
        if (deployments.length === 0) {
          throw new Error(`No deployments are available.`);
        }
        let foundDeployment = null;
        if (!name) {
          let answers = await inquirer.prompt([
            {
              type: "list",
              name: "deployment",
              message: "Which deployment do you want to destroy?",
              choices: deployments.map(deployment => {
                return `${deployment.id} - ${regions.getRegionLabel(
                  deployment.region
                )}`;
              })
            }
          ]);
          foundDeployment = deployments.find(deployment => {
            return (
              `${deployment.id} - ${regions.getRegionLabel(
                deployment.region
              )}` === answers["deployment"]
            );
          });
        } else {
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
