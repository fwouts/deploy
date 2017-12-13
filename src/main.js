"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const awsAuth = require("./service/aws/auth");
const awsCluster = require("./service/aws/cluster");
const awsDeployment = require("./service/aws/deployment");
const awsLoader = require("./service/aws/loader");
const localLauncher = require("./service/local/launcher");
const path = require("path");
const deploymentSpec = {
    name: "deployment",
    cluster: {
        region: "ap-southeast-2",
        name: "test"
    },
    container: {
        imageSource: {
            type: "local",
            dockerfilePath: path.resolve(__dirname, "..", "example-server", "Dockerfile")
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
    try {
        await awsCluster.createCluster({
            name: "test",
            region: "ap-southeast-2",
            ec2InstanceCount: 1,
            ec2InstanceType: "t2.micro"
        });
    }
    catch (_a) { }
    try {
        await awsDeployment.deploy(deploymentSpec, "mydeployment");
    }
    catch (_b) { }
    await localLauncher.deploy(deploymentSpec);
}
main().catch(console.error);
