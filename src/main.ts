// Necessary to prevent JSONStream from listening to process.stdin and crashing on keyboard input.
// See https://github.com/apocas/dockerode/issues/426 for details.
process.title = "browser";

import "source-map-support/register";
import "./commands/create-cluster";
import "./commands/destroy-cluster";
import "./commands/push";
import "./commands/kill";
import "./commands/map";
import "./commands/unmap";
import "./commands/status";

import * as analytics from "./analytics";
import * as console from "./service/console";
import * as program from "commander";
import * as updateCheck from "./update-check";

// TODO: Make sure this stays in sync with package.json.
export const VERSION = "0.0.6";

program.version(VERSION);

program.command("*").action(cmd => {
  console.logError(`Unknown command: ${cmd}.`);
  process.exit(1);
});

if (!process.argv.slice(2).length) {
  program.outputHelp();
} else {
  analytics
    .initializeTracker()
    .catch(e => {
      console.logError(e);
      process.exit(1);
    })
    .then(updateCheck.checkVersionIfNecessary)
    .then(() => {
      program.parse(process.argv);
    });
}
