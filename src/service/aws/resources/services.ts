import * as ECS from "aws-sdk/clients/ecs";
import * as loader from "../loader";

export interface Service {
  arn: string;
  name: string;
}

export async function createService(
  region: string,
  name: string,
  containerName: string,
  clusterArn: string,
  taskDefinitionArn: string,
  targetGroupArn: string,
  desiredCount: number,
  containerPort: number
): Promise<Service> {
  let ecs = new ECS({
    region: region
  });
  let serviceCreation = await ecs
    .createService({
      cluster: clusterArn,
      serviceName: name,
      taskDefinition: taskDefinitionArn,
      desiredCount: desiredCount,
      loadBalancers: [
        {
          targetGroupArn: targetGroupArn,
          containerName: containerName,
          containerPort: containerPort
        }
      ]
    })
    .promise();
  if (!serviceCreation.service) {
    throw new Error("Service could not be created.");
  }
  let service = serviceCreation.service;
  if (!service.serviceArn || !service.serviceName) {
    throw new Error("Service is missing key properties.");
  }
  return {
    arn: service.serviceArn,
    name: service.serviceName
  };
}

export async function getServicesInCluster(
  region: string,
  clusterArn: string
): Promise<string[]> {
  let ecs = new ECS({
    region
  });
  let serviceArns = await loader.loadUntilEnd(async token => {
    let { serviceArns, nextToken } = await ecs
      .listServices({
        cluster: clusterArn,
        nextToken: token
      })
      .promise();
    return {
      results: serviceArns,
      nextToken
    };
  });
  return serviceArns;
}

export async function destroyService(
  region: string,
  clusterArnOrName: string,
  serviceArnOrName: string
) {
  let ecs = new ECS({
    region
  });
  let servicesDescription = await ecs
    .describeServices({
      cluster: clusterArnOrName,
      services: [serviceArnOrName]
    })
    .promise();
  let activeService = false;
  for (let service of servicesDescription.services || []) {
    if (service.status === "ACTIVE") {
      activeService = true;
    }
  }
  if (!activeService) {
    // No service already.
    return;
  }
  await ecs
    .updateService({
      cluster: clusterArnOrName,
      service: serviceArnOrName,
      desiredCount: 0
    })
    .promise();
  await ecs
    .deleteService({
      cluster: clusterArnOrName,
      service: serviceArnOrName
    })
    .promise();
}
