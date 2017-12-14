import * as CloudFormation from "aws-sdk/clients/cloudformation";

const CLOUD_FORMATION_REFRESH_RATE_MILLIS = 2000;

export async function createCloudFormationStack(
  region: string,
  name: string,
  template: any
) {
  let cloudFormation = new CloudFormation({
    region: region
  });
  await cloudFormation
    .createStack({
      StackName: name,
      TemplateBody: JSON.stringify(template, null, 2)
    })
    .promise();
  let status = "CREATE_IN_PROGRESS";
  let stack;
  do {
    await new Promise(resolve =>
      setTimeout(resolve, CLOUD_FORMATION_REFRESH_RATE_MILLIS)
    );
    let description = await cloudFormation
      .describeStacks({
        StackName: name
      })
      .promise();
    if (!description.Stacks || description.Stacks.length === 0) {
      throw new Error(`CloudFormation stack ${name} could not be found.`);
    }
    stack = description.Stacks[0];
    status = stack.StackStatus;
  } while (status === "CREATE_IN_PROGRESS");
  if (status !== "CREATE_COMPLETE") {
    throw new Error(
      `CloudFormation stack could not be created: ${stack.StackStatusReason}`
    );
  }
}

export async function deleteCloudFormationStack(region: string, name: string) {
  let cloudFormation = new CloudFormation({
    region: region
  });
  await cloudFormation
    .deleteStack({
      StackName: name
    })
    .promise();
  let status = "DELETE_IN_PROGRESS";
  let stack;
  do {
    await new Promise(resolve =>
      setTimeout(resolve, CLOUD_FORMATION_REFRESH_RATE_MILLIS)
    );
    try {
      let description = await cloudFormation
        .describeStacks({
          StackName: name
        })
        .promise();
      if (!description.Stacks || description.Stacks.length === 0) {
        throw new Error(`CloudFormation stack ${name} could not be found.`);
      }
      stack = description.Stacks[0];
      status = stack.StackStatus;
    } catch (e) {
      if (e.code === "ValidationError") {
        // Expected.
        status = "DELETE_COMPLETE";
      } else {
        throw e;
      }
    }
  } while (status === "DELETE_IN_PROGRESS");
  if (status !== "DELETE_COMPLETE") {
    throw new Error(
      `CloudFormation stack could not be deleted: ${
        stack ? stack.StackStatusReason : "unknown reason"
      }`
    );
  }
}
