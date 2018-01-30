import * as EC2 from "aws-sdk/clients/ec2";

import { DocumentedError } from "../../errors";

export async function getEcsImageId(region: string): Promise<string> {
  let ec2 = new EC2({
    region: region
  });
  let imagesDescription = await ec2
    .describeImages({
      Filters: [
        {
          Name: "name",
          Values: ["amzn-ami*amazon-ecs-optimized"]
        }
      ]
    })
    .promise();
  let mostRecentEcsOptimizedImage: [Date, string] | null = null;
  for (let image of imagesDescription.Images || []) {
    if (!image.CreationDate || !image.ImageId) {
      continue;
    }
    let creationDate = new Date(image.CreationDate);
    if (
      !mostRecentEcsOptimizedImage ||
      mostRecentEcsOptimizedImage[0].getTime() < creationDate.getTime()
    ) {
      mostRecentEcsOptimizedImage = [creationDate, image.ImageId];
    }
  }
  if (!mostRecentEcsOptimizedImage) {
    throw new DocumentedError("Could not find an ECS-optimised image.");
  }
  return mostRecentEcsOptimizedImage[1];
}
