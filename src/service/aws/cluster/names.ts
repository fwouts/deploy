export function getResourceNames(clusterName: string) {
  return {
    cloudFormationStack: "cluster-" + clusterName,
    launchConfiguration: clusterName + "-launchconfig",
    autoScalingGroup: clusterName + "-autoscalinggroup",
    instance: clusterName + "-instance"
  };
}
