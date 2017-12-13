import * as ECR from "aws-sdk/clients/ecr";

const atob = require("atob");

export interface AuthConfig {
  username: string;
  password: string;
}

export async function getAuthConfig(region: string): Promise<AuthConfig> {
  let ecr = new ECR({
    region: region
  });
  let authTokenResponse = await ecr.getAuthorizationToken().promise();
  if (
    !authTokenResponse.authorizationData ||
    authTokenResponse.authorizationData.length == 0
  ) {
    throw new Error("Missing authorization token in authTokenResponse.");
  }
  let authorizationData = authTokenResponse.authorizationData[0];
  if (!authorizationData.authorizationToken) {
    throw new Error("Missing authorization token in authorizationData item.");
  }
  let [username, password] = atob(authorizationData.authorizationToken).split(
    ":"
  );
  return {
    username,
    password
  };
}

export interface Repository {
  arn: string;
  uri: string;
  name: string;
}

export async function getOrCreateRepository(region: string, name: string) {
  let ecr = new ECR({
    region: region
  });
  try {
    let existingRepositories = await ecr
      .describeRepositories({
        repositoryNames: [name]
      })
      .promise();
    if (
      existingRepositories.repositories &&
      existingRepositories.repositories.length === 1
    ) {
      let existingRepository = existingRepositories.repositories[0];
      if (
        !existingRepository.repositoryArn ||
        !existingRepository.repositoryUri
      ) {
        throw new Error("Repository is missing key properties.");
      }
      return {
        arn: existingRepository.repositoryArn,
        uri: existingRepository.repositoryUri,
        name: name
      };
    }
  } catch {}
  let createdRepositoryResponse = await ecr
    .createRepository({
      repositoryName: name
    })
    .promise();
  if (
    !createdRepositoryResponse.repository ||
    !createdRepositoryResponse.repository.repositoryArn ||
    !createdRepositoryResponse.repository.repositoryUri
  ) {
    throw new Error("Missing created repository.");
  }
  return {
    arn: createdRepositoryResponse.repository.repositoryArn,
    uri: createdRepositoryResponse.repository.repositoryUri,
    name: name
  };
}

export async function deleteImage(region: string, name: string, tag: string) {
  let ecr = new ECR({
    region: region
  });
  await ecr
    .batchDeleteImage({
      repositoryName: name,
      imageIds: [
        {
          imageTag: tag
        }
      ]
    })
    .promise();
}
