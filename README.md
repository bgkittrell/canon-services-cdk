# Setup

## Install/Auth

- Install the AWS CLI ([https://aws.amazon.com/cli/])
- Install the CDK CLI ([https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html])
- Setup AWS auth for CLI ([https://docs.aws.amazon.com/cli/v1/userguide/cli-chap-authentication.html])

## Development

While CDK does have support for local development, it currently doesn't support JWT auth in api gateways. The best way to test is to deploy live to AWS for now.

Using the following command, CDK will automatically detect changes in your code or CDK templates and deploy accordingly.

`cdk deploy --all --watch`

You can also deploy services indvidually.

`cdk deploy dev-FilesStack dev-AdminStack --watch`

## Development Environment

At a minimum you should setup Prettier in your IDE to auto format files based on the provided template. This will ensure consistency and help avoid git conflicts.

If you wish to have your own development stack on AWS you can create your own env.

`cdk deploy --all --watch -c env=mydevenv`

This will create DNS endpoints such as `files.api.mydevenv.canon.app` and a bucket called `mydevenv-canon-services-files`.

To delete this env:

`cdk destroy --all -c env=mydevenv`

# Prod Deployment

## Secrets

A deployment of this project on AWS expects the following variables to be setup in the Systems Manager Parameter Store ([https://us-east-1.console.aws.amazon.com/systems-manager/parameters/])

- Prod.AUTH0_CLIENT_ID
- Prod.AUTH0_CLIENT_SECRET
- Prod.AUTH0_DOMAIN
- Prod.OPENAI_API_KEY
- Prod.STRIPE_ENDPOINT_SECRET
- Prod.STRIPE_SECRET_KEY

## Domain name

The templates will automatically setup various domain names and certificates. You must have a hosted zone setup in Route 53. Once that's setup copy the hosted zone name into the properties in `bin/canon-services-cdk.ts` and the respective domain names such as `files.api.canon.app` and SAM will do the rest.

## Deployment

Use the following command to build and deploy the project from the root directory.

`cdk deploy --al -c env=prod`

You can optionally set `--profile my-aws-credentials` or `--region us-east-2` in the deploy command.

## Serverless Image Handler

Uses CloudFront and lambdas to automatically resize images. To setup follow these steps.

- Import the serverless-image-handler.template CloudFormation Template
  - Use the name of the FilesBucket for `SourceBucketsParameter`
- Setup Domain Name in Route 53
- Setup SSL Certificate
- Add Domain as an Alternate Domain in the new CloudFront Distribution
- Set values of VITE_FILES_BUCKET and VITE_CLOUD_FRONT_URI in front end env file

## SES Setup

To send email we need to setup SES. While in sandbox mode you must verify every email address you send to.

- Create identity for the domain you're sending from (https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/identities)
- Ensure DKIM records are created in Route 53
- When ready for production you must "Request production access" from the SES console
