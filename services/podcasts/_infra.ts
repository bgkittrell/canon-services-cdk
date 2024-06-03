import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as httpapi from 'aws-cdk-lib/aws-apigatewayv2'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as events from 'aws-cdk-lib/aws-events'
import * as iam from 'aws-cdk-lib/aws-iam'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { join } from 'path'
import { createApi, addResourcefulRoutes, createQueueConsumer } from '../core/_infra'

interface PodcastsProps extends cdk.StackProps {
  eventBusName: string
  domainName: string
  zoneName: string
  jwtIssuer: string
  jwtAudience: string
}

export class PodcastsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PodcastsProps) {
    super(scope, id, props)

    // DyanmoDB table
    const feedsTable = new dynamodb.Table(this, 'FeedsTable', {
      partitionKey: { name: 'UserId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    })

    const episodesTable = new dynamodb.Table(this, 'EpisodesTable', {
      partitionKey: { name: 'FeedId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'Id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    })

    // Transcripts bucket
    const transcriptsBucket = new s3.Bucket(this, 'TranscriptsBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: false,
        ignorePublicAcls: true,
        restrictPublicBuckets: false
      }),
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*']
        }
      ]
    })

    // Allow anyone to read from the transcripts bucket
    transcriptsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [transcriptsBucket.bucketArn, `${transcriptsBucket.bucketArn}/*`],
        actions: ['s3:GetObject'],
        principals: [new iam.AnyPrincipal()],
        effect: iam.Effect.ALLOW
      })
    )

    // Feeds API Gateway
    const { api, authorizer } = createApi(
      this,
      props.zoneName,
      props.domainName,
      props.jwtIssuer,
      props.jwtAudience
    )

    // Defaults for lambda functions
    const lambdaDefaults: NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(100),
      environment: {
        EVENT_BUS: props.eventBusName,
        FEEDS_TABLE: feedsTable.tableName,
        EPISODES_TABLE: episodesTable.tableName,
        TRANSCRIPT_BUCKET: transcriptsBucket.bucketName,
        TRANSCRIPT_BUCKET_DOMAIN: transcriptsBucket.bucketRegionalDomainName
      }
    }

    // Create CRUD routes
    const functions = addResourcefulRoutes(
      this,
      api,
      authorizer,
      lambdaDefaults,
      'feeds',
      join(__dirname, 'feeds', 'api.ts')
    )

    // Give the CRUD functions access to the bucket and table
    functions.forEach((fn) => {
      feedsTable.grantReadWriteData(fn)
    })

    // Create CRUD routes
    const episodeFunctions = addResourcefulRoutes(
      this,
      api,
      authorizer,
      lambdaDefaults,
      'feeds/{feedId}/episodes',
      join(__dirname, 'episodes', 'api.ts')
    )

    // Give the CRUD functions access to the bucket and table
    episodeFunctions.forEach((fn) => {
      episodesTable.grantReadWriteData(fn)
    })

    const needsTranscriptionFunction = new NodejsFunction(this, 'NeedsTranscriptionFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'episodes/transcribe-api.ts'),
      handler: 'getNeedsTranscription'
    })

    const updateTranscriptionFunction = new NodejsFunction(this, 'UpdateTranscriptionFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'episodes/transcribe-api.ts'),
      handler: 'update'
    })

    episodesTable.grantReadWriteData(needsTranscriptionFunction)
    episodesTable.grantReadWriteData(updateTranscriptionFunction)
    transcriptsBucket.grantReadWrite(updateTranscriptionFunction)

    api.addRoutes({
      path: '/episodes/needs-transcription',
      methods: [httpapi.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'NeedsTranscriptionFunctionIntegration',
        needsTranscriptionFunction
      )
    })

    api.addRoutes({
      path: '/feeds/{feedId}/episodes/{id}/transcription',
      methods: [httpapi.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateTranscriptionFunctionIntegration',
        updateTranscriptionFunction
      )
    })

    // Get the shared event bus
    const eventBus = events.EventBus.fromEventBusName(this, 'EventBus', props.eventBusName)

    // Allow lambdas to send events to the event bus
    functions.map((fn) => eventBus.grantPutEventsTo(fn))
    episodeFunctions.map((fn) => eventBus.grantPutEventsTo(fn))
    eventBus.grantPutEventsTo(updateTranscriptionFunction)

    // Queue consumer
    const queueConsumerFunction = createQueueConsumer(
      this,
      lambdaDefaults,
      join(__dirname, 'episodes', 'consumer.ts'),
      eventBus,
      {
        'services.podcasts': ['feed.created', 'episode.ready']
      }
    )
    episodesTable.grantReadWriteData(queueConsumerFunction)
    eventBus.grantPutEventsTo(queueConsumerFunction)
  }
}
