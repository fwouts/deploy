export function getResourceNames(deploymentId: string) {
  return {
    cloudFormationStack: "deployment-" + deploymentId,
    loadBalancer: deploymentId + "-loadbalancer",
    loadBalancerSecurityGroup: deploymentId + "-loadBalancerSecurityGroup",
    taskDefinition: deploymentId + "-taskdefinition",
    service: deploymentId + "-service",
    container: deploymentId + "-container",
    targetGroup: deploymentId + "-targetgroup",
    localDockerImage: deploymentId + "-image:latest",
    repository: "zenc-deploy-images",
    remoteDockerImageTag: deploymentId
  };
}
