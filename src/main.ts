import * as awsAuth from "./service/aws/auth";
import * as awsCluster from "./service/aws/cluster";
import * as awsDeployment from "./service/aws/deployment";
import * as awsLoader from "./service/aws/loader";
import * as path from "path";

async function main() {
  await awsAuth.authenticate();
  console.log(await awsLoader.loadClusters());
  console.log(await awsLoader.loadDeployments());
  try {
    await awsCluster.createCluster({
      name: "test",
      region: "ap-southeast-2",
      ec2InstanceCount: 1,
      ec2InstanceType: "t2.micro"
    });
  } catch {}
  await awsDeployment.deploy(
    {
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
      environment: {}
    },
    "mydeployment"
  );
}

main().catch(console.error);
