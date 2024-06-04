import { APIGatewayEvent } from 'aws-lambda'

export function getUserId(event: APIGatewayEvent) {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub
  if (!userId) {
    throw new Error('Forbidden')
  }
  return userId
}

export function getJwtToken(event: APIGatewayEvent) {
  if (!event.headers.authorization) {
    throw new Error('Forbidden')
  }
  return event.headers.authorization.split(' ')[1]
}
