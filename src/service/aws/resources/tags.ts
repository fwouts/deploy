export interface Tag {
  Key: string;
  Value: string;
}

export const SHARED_TAG: Tag = {
  Key: "zenc:deploy:resource",
  Value: ""
};

export const CLUSTER_NAME_TAG_KEY = "zenc:deploy:cluster:name";

export function clusterNameTag(clusterName: string): Tag {
  return {
    Key: CLUSTER_NAME_TAG_KEY,
    Value: clusterName
  };
}

export const DEPLOYMENT_ID_TAG_KEY = "zenc:deploy:deployment:id";

export function deploymentIdTag(deploymentId: string): Tag {
  return {
    Key: DEPLOYMENT_ID_TAG_KEY,
    Value: deploymentId
  };
}
