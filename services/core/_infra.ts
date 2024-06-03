import * as cdk from 'aws-cdk-lib'
import * as cm from 'aws-cdk-lib/aws-certificatemanager'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as httpapi from 'aws-cdk-lib/aws-apigatewayv2'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'

/**
 * Create an HTTP API Gateway with a custom domain and JWT authorizer
 * @param stack Stack to add resources to
 * @param zoneName Route53 hosted zone name
 * @param domainName Custom domain name
 * @param jwtIssuer JWT issuer
 * @param jwtAudience JWT audience
 * @returns API Gateway and Authorizer
 */
export function createApi(
  stack: cdk.Stack,
  zoneName: string,
  domainName: string,
  jwtIssuer: string,
  jwtAudience: string
) {
  const prefix = stack.stackName.replace(/[^a-zA-Z0-9]/g, '')
  const hostedZone = route53.HostedZone.fromLookup(stack, 'HostedZone', {
    domainName: zoneName
  })
  const certificate = new cm.Certificate(stack, 'ApiCertificate', {
    domainName: domainName,
    validation: cm.CertificateValidation.fromDns(hostedZone)
  })
  const domain = new httpapi.DomainName(stack, 'ApiDomain', {
    domainName: domainName,
    certificate
  })
  const api = new httpapi.HttpApi(stack, `${stack.stackName}-ApiGateway`, {
    corsPreflight: {
      allowOrigins: ['*'],
      allowMethods: [httpapi.CorsHttpMethod.ANY],
      allowHeaders: ['Authorization', 'Content-Type']
    },
    defaultDomainMapping: {
      domainName: domain
    }
  })
  const record = new route53.ARecord(stack, 'ApiRecord', {
    zone: hostedZone,
    target: route53.RecordTarget.fromAlias({
      bind: () => ({
        dnsName: domain.regionalDomainName,
        hostedZoneId: domain.regionalHostedZoneId
      })
    }),
    recordName: domainName
  })
  const authorizer = new HttpJwtAuthorizer('ApiAuthorizer', jwtIssuer, {
    jwtAudience: [jwtAudience]
  })
  return { api, authorizer }
}

/**
 * Create a set of resourceful routes for a given root path
 * Expects the following lambda functions to be present in the entry file:
 * - list
 * - get
 * - create
 * - update
 * - destroy
 *
 * These will automatically be added to the API Gateway with the following paths:
 * - GET /{root}
 * - GET /{root}/{id}
 * - POST /{root}
 * - PUT /{root}/{id}
 * - DELETE /{root}/{id}
 *
 * @param stack Stack to add resources to
 * @param api HTTP API Gateway
 * @param authorizer Jwt Authorizer
 * @param lambdaDefaults Default properties for lambda functions
 * @param root Root of the resourceful routes, e.g. 'files'
 * @param entry Path to the entry source file for the lambda functions
 * @returns List of lambda functions created
 */
export function addResourcefulRoutes(
  stack: cdk.Stack,
  api: httpapi.HttpApi,
  authorizer: HttpJwtAuthorizer,
  lambdaDefaults: NodejsFunctionProps,
  root: string,
  entry: string
) {
  const functions = ['List', 'Get', 'Create', 'Update', 'Destroy'].map((action) => {
    const prefix = root
      .replace(/\{.*?\}/, '')
      .split('/')
      .map(capitalizeFirstLetter)
      .join('')
    const name = `${prefix}${action}Function`
    const fn = new NodejsFunction(stack, name, {
      ...lambdaDefaults,
      entry: entry,
      handler: action.toLowerCase()
    })
    let path = `/${root}`
    let method = httpapi.HttpMethod.GET
    switch (action) {
      case 'Get':
        path = `${path}/{id}`
        break
      case 'Create':
        method = httpapi.HttpMethod.POST
        break
      case 'Update':
        path = `${path}/{id}`
        method = httpapi.HttpMethod.PUT
        break
      case 'Destroy':
        path = `${path}/{id}`
        method = httpapi.HttpMethod.DELETE
        break
    }
    api.addRoutes({
      path,
      methods: [method],
      integration: new HttpLambdaIntegration(`${name}Integration`, fn),
      authorizer
    })
    return fn
  })

  return functions
}

/**
 * Create a queue consumer lambda function that listens for events from other services
 * @param stack Stack to add resources to
 * @param lambdaDefaults Default properties for lambda functions
 * @param entry Entry file for the lambda function
 * @param eventBus Shared event bus
 * @param sources List of sources and detail types to listen for
 * @returns Lambda function
 */
export function createQueueConsumer(
  stack: cdk.Stack,
  lambdaDefaults: NodejsFunctionProps,
  entry: string,
  eventBus: events.IEventBus,
  sources: { [key: string]: string[] }
) {
  // Queue consumer
  const queueConsumerFunction = new NodejsFunction(stack, 'QueueConsumerFunction', {
    ...lambdaDefaults,
    entry,
    handler: 'handler'
  })

  // Setup consumer to accept events from other services
  for (const source of Object.keys(sources)) {
    const prefix = source.split('.').map(capitalizeFirstLetter).join('')
    const detailType = sources[source]
    const busRule = new events.Rule(stack, `${prefix}BusRules`, {
      eventBus: eventBus,
      eventPattern: {
        source: [source],
        detailType
      }
    })
    busRule.addTarget(new targets.LambdaFunction(queueConsumerFunction))
  }

  return queueConsumerFunction
}

function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
