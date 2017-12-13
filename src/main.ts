import "source-map-support/register";

import * as awsAuth from "./service/aws/auth";
import * as awsCluster from "./service/aws/cluster";
import * as awsDeployment from "./service/aws/deployment";
import * as awsLoader from "./service/aws/loader";
import * as deployModel from "./service/deploymodel";
import * as localLauncher from "./service/local/launcher";
import * as path from "path";

const deploymentSpec: deployModel.DeploymentSpec = {
  name: "deployment",
  cluster: {
    region: "ap-southeast-2",
    name: "test"
  },
  container: {
    imageSource: {
      type: "local",
      dockerfilePath: path.resolve(
        __dirname,
        "..",
        "example-server",
        "Dockerfile"
      )
    },
    memory: 512
  },
  desiredCount: 1,
  environment: {
    TEST: "Hello, World!"
  }
};

async function main() {
  await awsAuth.authenticate();
  console.log(await awsLoader.loadClusters());
  console.log(await awsLoader.loadDeployments());
  await awsCluster.createCluster({
    name: "test",
    region: "ap-southeast-2",
    ec2InstanceCount: 1,
    ec2InstanceType: "t2.micro"
  });
  await awsDeployment.deploy(deploymentSpec, "mydeployment");
  await awsDeployment.destroy(
    deploymentSpec.cluster.region,
    deploymentSpec.cluster.name,
    "mydeployment"
  );
  await awsCluster.destroy(
    deploymentSpec.cluster.region,
    deploymentSpec.cluster.name
  );
  await localLauncher.deploy(deploymentSpec);
}

main().catch(console.error);
