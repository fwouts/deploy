import * as AWS from "aws-sdk/global";
import * as console from "../console";

export async function authenticate(): Promise<void> {
  try {
    let credentials = new AWS.SharedIniFileCredentials({ profile: "default" });
    AWS.config.credentials = credentials;
    await credentials.getPromise();
  } catch (e) {
    if (e.code === "ENOENT") {
      console.logError("No AWS credentials found. Please run `aws configure`.");
      throw new console.AlreadyLoggedError(e);
    }
    throw e;
  }
}
