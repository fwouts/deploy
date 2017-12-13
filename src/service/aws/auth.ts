import * as AWS from "aws-sdk";

export async function authenticate(): Promise<void> {
  try {
    let credentials = new AWS.SharedIniFileCredentials({ profile: "default" });
    AWS.config.credentials = credentials;
    await credentials.getPromise();
  } catch (e) {
    console.error(e);
    throw e;
  }
}
