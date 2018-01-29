import * as AWS from "aws-sdk/global";
import * as console from "../console";

export async function authenticate(awsProfileName: string): Promise<void> {
  try {
    let credentials = new AWS.SharedIniFileCredentials({
      profile: awsProfileName
    });
    AWS.config.credentials = credentials;
    await credentials.getPromise();
  } catch (e) {
    if (e.code === "ENOENT") {
      console.logError("No AWS credentials found. Please run `aws configure`.");
      throw new console.AlreadyLoggedError(e);
    } else if (e.code === "SharedIniFileCredentialsProviderFailure") {
      console.logError(
        `No AWS profile named "${awsProfileName}". Try using --profile to specify one.`
      );
      throw new console.AlreadyLoggedError(e);
    }
    throw e;
  }
}
