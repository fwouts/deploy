import * as awsLoader from "../service/aws/loader";
import * as console from "../service/console";
import * as program from "commander";

import { checkedEnvironmentAction } from "./common";

program.command("list-clusters").action(
  checkedEnvironmentAction(async () => {
    let clusters = await awsLoader.loadClusters();
    console.logInfo(JSON.stringify(clusters, null, 2));
  })
);
