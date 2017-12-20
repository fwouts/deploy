import { Event } from "./tracker";

// All events tracked across the app should be defined here, to make sure there
// is a single source of truth.

export function statusCommand(): Event {
  return {
    eventType: "Command: Status",
    trackedProperties: {}
  };
}

export function createClusterCommand(): Event {
  return {
    eventType: "Command: Create Cluster",
    trackedProperties: {}
  };
}

export function destroyClusterCommand(): Event {
  return {
    eventType: "Command: Destroy Cluster",
    trackedProperties: {}
  };
}

export function createDeploymentCommand(): Event {
  return {
    eventType: "Command: Create Deployment",
    trackedProperties: {}
  };
}

export function destroyDeploymentCommand(): Event {
  return {
    eventType: "Command: Destroy Deployment",
    trackedProperties: {}
  };
}

export function mapDNSCommand(): Event {
  return {
    eventType: "Command: Map DNS",
    trackedProperties: {}
  };
}

export function unmapDNSCommand(): Event {
  return {
    eventType: "Command: Unmap DNS",
    trackedProperties: {}
  };
}

export type TrackedCalls =
  | "Status"
  | "Create Cluster"
  | "Destroy Cluster"
  | "Create Deployment"
  | "Destroy Deployment"
  | "Map DNS"
  | "Unmap DNS";
