import * as awsLoader from "../service/aws/loader";
import * as console from "../service/console";
import * as program from "commander";

import { checkedEnvironmentAction } from "./common";

program.command("list-deployments").action(
  checkedEnvironmentAction(async () => {
    let deployments = await awsLoader.loadDeployments();
    console.logInfo(JSON.stringify(deployments, null, 2));
  })
);
