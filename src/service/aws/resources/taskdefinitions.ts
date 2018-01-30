import * as ECS from "aws-sdk/clients/ecs";

import { DocumentedError } from "../../errors";

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
  environment: { [key: string]: string }
): Promise<TaskDefinition> {
  let ecs = new ECS({
    region: region
  });
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
              hostPort: 0,
              containerPort: containerPort
            }
          ],
          environment: environmentVariables
        }
      ]
    })
    .promise();
  if (
    !taskDefinition.taskDefinition ||
    !taskDefinition.taskDefinition.taskDefinitionArn ||
    !taskDefinition.taskDefinition.family
  ) {
    throw new DocumentedError("Task definition could not be created.");
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
