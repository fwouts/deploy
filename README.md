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
> deploy create-cluster
? Please choose a name for your cluster: staging
? Which region do you want to create your cluster in? ap-southeast-2 - Asia Pacific (Sydney)
? What type of EC2 instance should be started? T2 Micro (1 vCPU, 1GB RAM) - estimated USD$10.86/month/instance
? How many EC2 instances should be created? 1
...
Cluster staging created successfully.
```

## Starting a deployment

Deploying your local code is a single line:

```shell
> deploy push
? Which cluster do you want to deploy in? staging (ap-southeast-2)
? Please choose a name for your deployment: example
? How many Docker containers should be deployed? 1
? How much memory should be allocated to each container (in MB)? 512
...
Deployed successfully at http://example-loadbalancer-12345.ap-southeast-2.elb.amazonaws.com (live in a few minutes).
```

## Turning down a deployment

It's even easier than deploying it in the first place:

```shell
> deploy kill
? Which deployment do you want to destroy? example - Asia Pacific (Sydney)
...
Destroyed deployment example successfully.
```

## Destroying a cluster

If you don't use your clusters, you should probably turn them down:

```shell
> deploy destroy-cluster
? Which cluster do you want to destroy? staging (ap-southeast-2)
...
Cluster staging destroyed successfully.
```

## Mapping a deployment to your subdomain

```shell
> deploy map mydeployment demo.yourdomain.com
Route 53 record set updated.
Deployment mydeployment should soon be accessible at http://demo.yourdomain.com
```

## Unmapping your subdomain

```shell
> deploy unmap demo.yourdomain.com
Route 53 record set updated.
http://demo.yourdomain.com will soon no longer be available.
```

## Status

Use the status command to get a quick overview of your clusters and deployments.

```
> deploy status

-------------------

Cluster 'staging' in Asia Pacific (Sydney):
- EC2 instance type: t2.micro
- Desired instances: 5
- Running instances: 5

Deployments in cluster 'staging':
- example1:
    URL: http://example1-loadbalancer-12345.ap-southeast-2.elb.amazonaws.com
    Running tasks: 1 (1 desired, 0 pending)
- example2:
    URL: http://example2-loadbalancer-56789.ap-southeast-2.elb.amazonaws.com
    Running tasks: 1 (1 desired, 0 pending)
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
