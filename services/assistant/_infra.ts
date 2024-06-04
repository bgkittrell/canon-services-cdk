import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as httpapi from 'aws-cdk-lib/aws-apigatewayv2'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'

import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { join } from 'path'

import { createApi, createQueueConsumer } from '../core/_infra'

interface AssistantProps extends cdk.StackProps {
  eventBusName: string
  domainName: string
  podcastApiUrl: string
  zoneName: string
  jwtIssuer: string
  jwtAudience: string
}

export class AssistantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AssistantProps) {
    super(scope, id, props)

    // DyanmoDB table
    const assistantsTable = new dynamodb.Table(this, 'AssistantsTable', {
      partitionKey: { name: 'UserId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    })
    const chatSessionsTable = new dynamodb.Table(this, 'ChatSessionsTable', {
      partitionKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })
    const locksTable = new dynamodb.Table(this, 'LocksTable', {
      partitionKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const openaiApiKey = ssm.StringParameter.valueForStringParameter(this, 'Prod.OPENAI_API_KEY')

    // Defaults for lambda functions
    const lambdaDefaults: NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(5),
      environment: {
        EVENT_BUS: props.eventBusName,
        LOCKS_TABLE: locksTable.tableName,
        ASSISTANTS_TABLE: assistantsTable.tableName,
        CHAT_SESSIONS_TABLE: chatSessionsTable.tableName,
        PODCAST_API_URL: props.podcastApiUrl,
        OPENAI_API_KEY: openaiApiKey
      }
    }

    const streamFunction = new NodejsFunction(this, 'StreamFunction', {
      ...lambdaDefaults,
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024,
      entry: join(__dirname, 'chat', 'stream.ts'),
      handler: 'handler'
    })
    const streamFunctionUrl = new lambda.FunctionUrl(this, 'StreamFunctionUrl', {
      function: streamFunction,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowCredentials: false,
        allowedHeaders: ['*'],
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.POST]
      }
    })
    const streamFunctionPolicy = new lambda.CfnPermission(this, 'StreamFunctionPolicy', {
      action: 'lambda:InvokeFunctionUrl',
      functionName: streamFunction.functionName,
      principal: '*',
      functionUrlAuthType: 'NONE'
    })

    const createChatSessionFunction = new NodejsFunction(this, 'CreateChatSessionFunction', {
      ...lambdaDefaults,
      environment: {
        CHAT_SESSIONS_TABLE: chatSessionsTable.tableName,
        ASSISTANTS_TABLE: assistantsTable.tableName,
        OPENAI_API_KEY: openaiApiKey,
        STREAM_URL: streamFunctionUrl.url
      },
      entry: join(__dirname, 'chat', 'api.ts'),
      handler: 'createSession'
    })

    // Permissions
    assistantsTable.grantReadWriteData(streamFunction)
    chatSessionsTable.grantReadWriteData(streamFunction)

    assistantsTable.grantReadWriteData(createChatSessionFunction)
    chatSessionsTable.grantReadWriteData(createChatSessionFunction)

    const { api, authorizer } = createApi(
      this,
      props.zoneName,
      props.domainName,
      props.jwtIssuer,
      props.jwtAudience
    )

    // API Gateway
    api.addRoutes({
      path: '/sessions',
      methods: [httpapi.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateChatSessionFunctionIntegration',
        createChatSessionFunction
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
        'services.files': ['file.created', 'file.updated', 'file.deleted'],
        'services.podcasts': ['episode.transcribed', 'feed.updated']
      }
    )

    eventBus.grantPutEventsTo(queueConsumerFunction)

    assistantsTable.grantReadWriteData(queueConsumerFunction)
    chatSessionsTable.grantReadWriteData(queueConsumerFunction)
    locksTable.grantReadWriteData(queueConsumerFunction)
  }
}
