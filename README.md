# Deploy

Deploy is a command-line tool that aims to make Docker deployments as simple as possible.

Unlike [Now](https://zeit.co/now) or [Heroku](https://devcenter.heroku.com/articles/heroku-cli), Deploy deploys directly to AWS. There are no intermediaries involved.

## Installing

1. Make sure you have [NPM](https://www.npmjs.com/get-npm) installed
2. Run: `npm install --global @zenclabs/deploy`
3. Check that Deploy is installed with: `deploy --help`

## Creating a cluster

Before you can start a deployment, you need to create a cluster.

```shell
# Create a cluster with one t2.micro EC2 instance in Australia.
deploy create-cluster gday --region ap-southeast-2

# Create a cluster with five t2.large EC2 instances in Oregon.
deploy create-cluster prod -r us-west-2 -t t2.large -n 5
```

## Starting a deployment

Deploying your local code is a single line:

```shell
# Deploy your local codebase to AWS.
deploy create-deployment myserver ./Dockerfile --cluster gday

# Deploy multiple containers.
deploy create-deployment server-prod ./Dockerfile -c gday -n 10
```

## Turning down a deployment

It's even easier than deploying it in the first place:

```shell
deploy destroy-deployment myserver
```

## Destroying a cluster

If you don't use your clusters, you should probably turn them down:

```shell
deploy destroy-cluster mycluster --region ap-southeast-2
```

## FAQ

### How much does it cost?

Deploy CLI doesn't cost anything. You'll only be charged by AWS for the EC2 instances you run, as well as the load balancers (one load balancer per deployment).

### What about other cloud providers?

Right now, Deploy only supports AWS. If you'd like it for another cloud provider, please create an issue explaining your use case.

### Why do I have to create a cluster before a deployment?

A deployment needs some machines to run onto. Fortunately, that will soon no longer be true once [AWS Fargate](https://aws.amazon.com/fargate/) is available in all regions.

We could also consider creating one cluster per deployment automatically. If you'd like this, please create an issue explaining your use case.

### I don't use Docker, can I use Deploy?

Right now, Deploy requires you to have a Dockerfile. However, we're considering adding a step-by-step Dockerfile generator to make it easier.

### Does Deploy help me manage my databases?

No, but we could explore that in the future. Let us know in the issue tracker.
