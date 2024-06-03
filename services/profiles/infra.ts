import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as httpapi from 'aws-cdk-lib/aws-apigatewayv2'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as events from 'aws-cdk-lib/aws-events'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'

import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { join } from 'path'

import { createApi, createQueueConsumer } from '../core/infra'

interface ProfilesProps extends cdk.StackProps {
  eventBusName: string
  domainName: string
  zoneName: string
  jwtIssuer: string
  jwtAudience: string
}

export class ProfilesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ProfilesProps) {
    super(scope, id, props)
    const auth0ClientId = ssm.StringParameter.valueForStringParameter(this, 'Prod.AUTH0_CLIENT_ID')
    const auth0ClientSecret = ssm.StringParameter.valueForStringParameter(
      this,
      'Prod.AUTH0_CLIENT_SECRET'
    )
    const auth0Domain = ssm.StringParameter.valueForStringParameter(this, 'Prod.AUTH0_DOMAIN')

    // Defaults for lambda functions
    const lambdaDefaults: NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(5),
      environment: {
        EVENT_BUS: props.eventBusName,
        AUTH0_CLIENT_ID: auth0ClientId,
        AUTH0_CLIENT_SECRET: auth0ClientSecret,
        AUTH0_DOMAIN: auth0Domain
      }
    }

    const getProfileFunction = new NodejsFunction(this, 'GetProfileFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'api.ts'),
      handler: 'get'
    })

    const updateProfileFunction = new NodejsFunction(this, 'UpdateProfileFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'api.ts'),
      handler: 'update'
    })

    // API Gateway
    const { api, authorizer } = createApi(
      this,
      props.zoneName,
      props.domainName,
      props.jwtIssuer,
      props.jwtAudience
    )

    api.addRoutes({
      path: '/profile',
      methods: [httpapi.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetProfileFunctionIntegration', getProfileFunction),
      authorizer
    })

    api.addRoutes({
      path: '/profile',
      methods: [httpapi.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateProfileFunctionIntegration',
        updateProfileFunction
      ),
      authorizer
    })

    // Get the shared event bus
    const eventBus = events.EventBus.fromEventBusName(this, 'EventBus', props.eventBusName)

    // Queue consumer
    const queueConsumerFunction = createQueueConsumer(
      this,
      { ...lambdaDefaults, timeout: cdk.Duration.seconds(30), memorySize: 512 },
      join(__dirname, 'consumer.ts'),
      eventBus,
      {
        'services.stripe': ['subscription.created']
      }
    )

    eventBus.grantPutEventsTo(queueConsumerFunction)
  }
}
