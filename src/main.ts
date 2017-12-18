import "source-map-support/register";
import "./commands/create-cluster";
import "./commands/create-deployment";
import "./commands/destroy-cluster";
import "./commands/destroy-deployment";
import "./commands/list-clusters";
import "./commands/list-deployments";

import * as console from "./service/console";
import * as program from "commander";

// TODO: Make sure this stays in sync with package.json.
const VERSION = "0.0.4";

program.version(VERSION);

program.command("*").action(cmd => {
  console.logError(`Unknown command: ${cmd}.`);
  process.exit(1);
});

program.parse(process.argv);
