import * as ECS from "aws-sdk/clients/ecs";
import * as STS from "aws-sdk/clients/sts";

export interface TaskDefinition {
  arn: string;
  family: string;
}

export async function createTaskDefinition(
  region: string,
  name: string,
  containerName: string,
  containerImageUri: string,
  loadBalancerDns: string,
  containerPort: number,
  containerMemory: number,
  containerCpuUnits: number | undefined,
  environment: { [key: string]: string },
  launchType: "EC2" | "FARGATE"
): Promise<TaskDefinition> {
  let sts = new STS({
    region: region
  });
  let ecs = new ECS({
    region: region
  });
  let callerIdentity = await sts.getCallerIdentity().promise();
  let environmentVariables: ECS.EnvironmentVariables = [];
  for (let [key, value] of Object.entries(environment)) {
    environmentVariables.push({
      name: key,
      value: value
    });
  }
  let taskDefinition = await ecs
    .registerTaskDefinition({
      family: name,
      containerDefinitions: [
        {
          name: containerName,
          image: containerImageUri,
          memory: containerMemory,
          cpu: containerCpuUnits,
          portMappings: [
            {
              hostPort: launchType === "FARGATE" ? containerPort : 0,
              containerPort: containerPort
            }
          ],
          environment: environmentVariables
        }
      ],
      requiresCompatibilities: launchType === "FARGATE" ? ["FARGATE"] : [],
      memory: containerMemory.toString(10),
      cpu: containerCpuUnits ? containerCpuUnits.toString(10) : undefined,
      networkMode: launchType === "FARGATE" ? "awsvpc" : "bridge",
      executionRoleArn:
        launchType === "FARGATE"
          ? `arn:aws:iam::${callerIdentity.Account}:role/ecsTaskExecutionRole`
          : undefined
    })
    .promise();
  if (
    !taskDefinition.taskDefinition ||
    !taskDefinition.taskDefinition.taskDefinitionArn ||
    !taskDefinition.taskDefinition.family
  ) {
    throw new Error("Task definition could not be created.");
  }
  return {
    arn: taskDefinition.taskDefinition.taskDefinitionArn,
    family: taskDefinition.taskDefinition.family
  };
}

export async function deregisterTaskDefinition(region: string, name: string) {
  let ecs = new ECS({
    region
  });
  let taskDefinitionFamiliesList = await ecs
    .listTaskDefinitionFamilies({
      familyPrefix: name
    })
    .promise();
  for (let taskDefinitionFamily of taskDefinitionFamiliesList.families || []) {
    let taskDefinitionsList = await ecs
      .listTaskDefinitions({
        familyPrefix: taskDefinitionFamily
      })
      .promise();
    for (let taskDefinitionArn of taskDefinitionsList.taskDefinitionArns ||
      []) {
      await ecs
        .deregisterTaskDefinition({
          taskDefinition: taskDefinitionArn
        })
        .promise();
    }
  }
}
