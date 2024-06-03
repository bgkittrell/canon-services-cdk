import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as httpapi from 'aws-cdk-lib/aws-apigatewayv2'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'

import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { join } from 'path'

import { createApi } from '../core/infra'

interface AdminProps extends cdk.StackProps {
  domainName: string
  zoneName: string
  jwtIssuer: string
  jwtAudience: string
}

export class AdminStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AdminProps) {
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
        AUTH0_CLIENT_ID: auth0ClientId,
        AUTH0_CLIENT_SECRET: auth0ClientSecret,
        AUTH0_DOMAIN: auth0Domain
      }
    }

    const getUsersFunction = new NodejsFunction(this, 'GetUsersFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'api.ts'),
      handler: 'getAll'
    })

    const getUserFunction = new NodejsFunction(this, 'GetUserFunction', {
      ...lambdaDefaults,
      entry: join(__dirname, 'api.ts'),
      handler: 'get'
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
      path: '/users',
      methods: [httpapi.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetUsersFunctionIntegration', getUsersFunction),
      authorizer
    })

    api.addRoutes({
      path: '/users/{id}',
      methods: [httpapi.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetUserFunctionIntegration', getUserFunction),
      authorizer
    })
  }
}
