import * as Docker from "dockerode";
import * as console from "./console";
import * as fs from "fs";
import * as path from "path";
import * as tar from "tar-fs";

export async function checkEnvironment() {
  await getDocker();
}

export async function createDockerImage(dockerfilePath: string, name: string) {
  let docker = await getDocker();
  if (!dockerfilePath) {
    throw new Error(`Please select a Dockerfile!`);
  }
  dockerfilePath = path.resolve(dockerfilePath);
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`No such file at path ${dockerfilePath}.`);
  }
  let stream: NodeJS.ReadableStream = await docker.buildImage(
    tar.pack(path.dirname(dockerfilePath)),
    {
      t: name
    }
  );
  await new Promise((resolve, reject) => {
    stream.resume();
    stream.on("error", e => {
      reject(e);
    });
    stream.on("end", () => {
      resolve();
    });
  });
}

export async function getExposedPort(tag: string): Promise<number> {
  let docker = await getDocker();
  let image = docker.getImage(tag);
  let imageInspectInfo = await image.inspect();
  let exposedPort = null;
  for (let portAndProtocol of Object.keys(
    imageInspectInfo.Config.ExposedPorts
  )) {
    let [port, protocol] = portAndProtocol.split("/");
    if (protocol !== "tcp") {
      continue;
    }
    if (exposedPort !== null) {
      throw new Error("Docker image should expose exactly one TCP port.");
    }
    exposedPort = parseInt(port, 10);
  }
  if (exposedPort === null) {
    throw new Error("Docker image should expose exactly one TCP port.");
  }
  return exposedPort;
}

export async function pushDockerImage(
  region: string,
  sourceImage: string,
  repositoryUri: string,
  tag: string,
  authConfig?: { username: string; password: string }
): Promise<string> {
  let pushTag = repositoryUri + ":" + tag;
  let docker = await getDocker();
  let image = docker.getImage(sourceImage);
  await image
    .tag({
      repo: pushTag
    })
    .then();
  // TODO: Find out what layers are available in the image and wait for all of them  to be pushed.
  let pushImage = docker.getImage(pushTag);
  let stream = await pushImage.push({
    authconfig: authConfig
  });
  stream.on("data", (data: Buffer) => {
    try {
      let update = JSON.parse(data.toString());
      if (update.id && typeof update.progress === "string") {
        console.logInfo(update.progress);
      }
    } catch (e) {
      // Ignore. There are invalid JSON messages sometimes.
    }
  });
  await new Promise((resolve, reject) => {
    stream.on("error", e => {
      reject(e);
    });
    stream.on("end", () => {
      resolve();
    });
  });
  return pushTag;
}

export async function getDocker() {
  let docker = new Docker({
    socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock"
  });
  try {
    await docker.info();
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        "Docker engine does not seem to be running locally. Please visit https://docs.docker.com/engine/installation for more information."
      );
    } else {
      throw e;
    }
  }
  return docker;
}
