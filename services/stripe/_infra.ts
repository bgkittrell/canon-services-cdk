import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as httpapi from 'aws-cdk-lib/aws-apigatewayv2'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as events from 'aws-cdk-lib/aws-events'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'

import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { join } from 'path'

import { createApi, createQueueConsumer } from '../core/_infra'

interface StripeProps extends cdk.StackProps {
  eventBusName: string
  domainName: string
  zoneName: string
  jwtIssuer: string
  jwtAudience: string
}

export class StripeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StripeProps) {
    super(scope, id, props)
    const stripeSecretKey = ssm.StringParameter.valueForStringParameter(
      this,
      'Prod.STRIPE_SECRET_KEY'
    )
    const stripeEndpointSecret = ssm.StringParameter.valueForStringParameter(
      this,
      'Prod.STRIPE_ENDPOINT_SECRET'
    )

    const subscriptionsTable = new dynamodb.Table(this, 'SubscriptionsTable', {
      partitionKey: { name: 'UserId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    })

    // Defaults for lambda functions
    const lambdaDefaults: NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(5),
      environment: {
        EVENT_BUS: props.eventBusName,
        SUBSCRIPTIONS_TABLE: subscriptionsTable.tableName,
        STRIPE_SECRET_KEY: stripeSecretKey,
        STRIPE_ENDPOINT_SECRET: stripeEndpointSecret
      }
    }

    const webhookFunction = new NodejsFunction(this, 'WebhookFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'webhook.ts'),
      handler: 'handler'
    })

    const createPortalSessionFunction = new NodejsFunction(this, 'CreatePortalSessionFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'api.ts'),
      handler: 'createPortalSession'
    })

    const getSubscriptionFunction = new NodejsFunction(this, 'GetSubscriptionFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'api.ts'),
      handler: 'getSubscription'
    })

    subscriptionsTable.grantReadWriteData(getSubscriptionFunction)
    subscriptionsTable.grantReadWriteData(createPortalSessionFunction)
    subscriptionsTable.grantReadWriteData(webhookFunction)

    // API Gateway
    const { api, authorizer } = createApi(
      this,
      props.zoneName,
      props.domainName,
      props.jwtIssuer,
      props.jwtAudience
    )

    api.addRoutes({
      path: '/webhoook',
      methods: [httpapi.HttpMethod.POST],
      integration: new HttpLambdaIntegration('WebhookFunctionIntegration', webhookFunction),
      authorizer
    })

    api.addRoutes({
      path: '/portal/session',
      methods: [httpapi.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreatePortalSessionFunctionIntegration',
        createPortalSessionFunction
      ),
      authorizer
    })

    api.addRoutes({
      path: '/subscription',
      methods: [httpapi.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetSubscriptionFunctionIntegration',
        getSubscriptionFunction
      ),
      authorizer
    })

    // Get the shared event bus
    const eventBus = events.EventBus.fromEventBusName(this, 'EventBus', props.eventBusName)

    eventBus.grantPutEventsTo(webhookFunction)
  }
}
