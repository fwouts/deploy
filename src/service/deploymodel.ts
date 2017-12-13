export interface ClusterSpec {
  name: string;
  region: string;
  ec2InstanceType: string;
  ec2InstanceCount: number;
}

export interface DeploymentSpec {
  name: string;
  cluster: {
    region: string;
    name: string;
  };
  container: ContainerSpec;
  desiredCount: number;
  environment: { [key: string]: string };
}

export interface ContainerSpec {
  imageSource: ContainerSource;
  memory: number;
  cpuUnits?: number;
}

// TODO: Add support for other sources (e.g. DockerHub or ECR URI).
export type ContainerSource = LocalContainerSource;

export interface LocalContainerSource {
  type: "local";
  dockerfilePath: string;
}
