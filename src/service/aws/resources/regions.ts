export interface Region {
  id: string;
  label: string;
}

// List imported from http://docs.aws.amazon.com/general/latest/gr/rande.html#ecs_region.
export const ECS_REGIONS = [
  {
    id: "us-east-2",
    label: "US East (Ohio)"
  },
  {
    id: "us-east-1",
    label: "US East (N. Virginia)"
  },
  {
    id: "us-west-2",
    label: "US West (Oregon)"
  },
  {
    id: "us-west-1",
    label: "US West (N. California)"
  },
  {
    id: "ca-central-1",
    label: "Canada (Central)"
  },
  {
    id: "eu-central-1",
    label: "EU (Frankfurt)"
  },
  {
    id: "eu-west-2",
    label: "EU (London)"
  },
  {
    id: "eu-west-1",
    label: "EU (Ireland)"
  },
  {
    id: "ap-northeast-2",
    label: "Asia Pacific (Seoul)"
  },
  {
    id: "ap-northeast-1",
    label: "Asia Pacific (Tokyo)"
  },
  {
    id: "ap-southeast-2",
    label: "Asia Pacific (Sydney)"
  },
  {
    id: "ap-southeast-1",
    label: "Asia Pacific (Singapore)"
  }
];
