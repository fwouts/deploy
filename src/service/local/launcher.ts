import * as Docker from "dockerode";
import * as console from "../console";
import * as deployModel from "../deploymodel";
import * as dockerUtil from "../docker";
import * as portFinder from "portfinder";

const LOCAL_DOCKER_NETWORK_NAME = "zenc-deploy-network";
const LABELS = {
  "zenc:deploy": "yes"
};
const LABEL_FILTER = {
  "zenc:deploy=yes": true
};

export async function deploy(
  deploymentSpec: deployModel.DeploymentSpec
): Promise<void> {
  console.logInfo(`Deploying ${deploymentSpec.name} locally...`);
  let docker = new Docker({ socketPath: "/var/run/docker.sock" });
  await destroyPreviousDeployment();
  try {
    await docker.getNetwork(LOCAL_DOCKER_NETWORK_NAME).inspect();
  } catch (e) {
    if (e.reason !== "no such network") {
      throw e;
    }
    console.logInfo(`Creating Docker network ${LOCAL_DOCKER_NETWORK_NAME}...`);
    await docker.createNetwork({
      Name: LOCAL_DOCKER_NETWORK_NAME,
      Driver: "bridge",
      IPAM: {
        Config: [
          {
            Subnet: "192.168.0.0/24",
            Gateway: "192.168.0.1"
          }
        ]
      },
      Labels: LABELS
    });
  }
  let imageTag = `deploy-local-${deploymentSpec.name}-image`;
  console.logInfo(`Creating Docker image ${imageTag}...`);
  await dockerUtil.createDockerImage(
    deploymentSpec.container.imageSource.dockerfilePath,
    imageTag
  );
  console.logInfo(`Docker image created.`);
  let containerPort = await dockerUtil.getExposedPort(imageTag);
  let environment: string[] = [];
  for (let [key, value] of Object.entries(deploymentSpec.environment)) {
    environment.push(key + "=" + value);
  }
  let exposedPorts: { [portAndProtocol: string]: {} } = {
    [containerPort + "/tcp"]: {}
  };
  let hostPort = await portFinder.getPortPromise({
    port: 7000
  });
  let portBindings: {
    [portAndProtocol: string]: { HostPort: string }[];
  } = {
    [containerPort + "/tcp"]: [{ HostPort: hostPort.toString() }]
  };
  console.logInfo(`Creating Docker container...`);
  let container = await docker.createContainer({
    Image: imageTag,
    Env: environment,
    Labels: LABELS,
    ExposedPorts: exposedPorts,
    HostConfig: {
      PortBindings: portBindings,
      NetworkMode: LOCAL_DOCKER_NETWORK_NAME
    }
  });
  console.logInfo(`Docker container ${container.id} created.`);
  let stream = await container.attach({
    stream: true,
    follow: true,
    stderr: true,
    stdout: true
  });
  stream.pipe(process.stdout);
  await container.start();
  console.logSuccess(
    `Docker container started at http://localhost:${hostPort}`
  );
}

export async function destroyPreviousDeployment(): Promise<void> {
  let docker = new Docker({ socketPath: "/var/run/docker.sock" });
  let containers = await docker.listContainers({
    all: true,
    filters: {
      label: LABEL_FILTER
    }
  });
  if (containers.length > 0) {
    console.logInfo(
      `Destroying ${containers.length} previous container${
        containers.length > 1 ? "s" : ""
      }...`
    );
  }
  for (let containerInfo of containers) {
    let container = docker.getContainer(containerInfo.Id);
    if (containerInfo.State !== "exited" && containerInfo.State !== "created") {
      await container.stop();
    }
    await container.remove();
  }
  if (containers.length > 0) {
    console.logInfo(`Previous containers destroyed.`);
  }
}
