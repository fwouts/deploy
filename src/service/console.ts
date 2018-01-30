import * as util from "util";

import { DocumentedError } from "./errors";
import chalk from "chalk";

export function logInfo(message: string) {
  console.log(message);
}

export function logWarning(message: string) {
  console.log(chalk.yellow(message));
}

export function logError(error: any) {
  if (error instanceof AlreadyLoggedError) {
    return;
  }
  let message;
  if (
    typeof error === "object" &&
    error !== null &&
    typeof error["message"] === "string"
  ) {
    message = error["message"];
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = util.inspect(error);
  }
  console.log(chalk.red(message));
  if (!(error instanceof DocumentedError)) {
    // This is not an error that we produced ourselves, so show a stack trace.
    console.log(error.stack);
  }
}

export function logSuccess(message: string) {
  console.log(chalk.green(message));
}

export class AlreadyLoggedError extends DocumentedError {}
