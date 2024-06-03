import { ManagementClient } from 'auth0'

const auth0Domain = process.env.AUTH0_DOMAIN
const clientId = process.env.AUTH0_CLIENT_ID
const clientSecret = process.env.AUTH0_CLIENT_SECRET

export async function update(event: any) {
  const userId = event.requestContext.authorizer.jwt.claims.sub
  const requestBody = JSON.parse(event.body)
  const { userMetadata } = requestBody
  if (!auth0Domain || !clientId || !clientSecret) {
    throw new Error('Auth0 environment variables not set')
  }
  const management = new ManagementClient({
    domain: auth0Domain,
    clientId: clientId,
    clientSecret: clientSecret
  })

  const params = { id: userId }
  const data = await transform(userId, userMetadata)
  await management.users.update(params, data)
  return {
    statusCode: 200,
    body: 'User metadata updated successfully'
  }
}

async function transform(userId: string, metadata: any) {
  const data: any = { user_metadata: metadata }
  if (userId.includes('auth0')) {
    if (metadata.name) {
      data.name = metadata.name
      metadata.name = undefined
    }
    if (metadata.picture) {
      data.picture = metadata.picture
      metadata.picture = undefined
    }
    if (metadata.email) {
      data.email = metadata.email
      metadata.email = undefined
    }
    if (metadata.password) {
      data.password = metadata.password
      metadata.password = undefined
    }
  }
  return data
}

export async function get(event: any) {
  if (!auth0Domain || !clientId || !clientSecret) {
    throw new Error('Auth0 environment variables not set')
  }
  const userId = event.requestContext.authorizer.jwt.claims.sub
  const management = new ManagementClient({
    domain: auth0Domain,
    clientId: clientId,
    clientSecret: clientSecret
  })

  const user = await management.users.get({ id: userId })
  if (!user) {
    return {
      statusCode: 404,
      body: 'User not found'
    }
  }
  console.log('User:', user)
  return {
    statusCode: 200,
    body: JSON.stringify(user.data)
  }
}
