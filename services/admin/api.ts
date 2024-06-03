import { ManagementClient } from 'auth0'

const auth0Domain = process.env.AUTH0_DOMAIN
const clientId = process.env.AUTH0_CLIENT_ID
const clientSecret = process.env.AUTH0_CLIENT_SECRET

function getAuth0Client() {
  if (!auth0Domain || !clientId || !clientSecret) {
    throw new Error('Auth0 environment variables not set')
  }
  return new ManagementClient({
    domain: auth0Domain,
    clientId: clientId,
    clientSecret: clientSecret
  })
}

export async function getAll(event: any) {
  const perPage = event.queryStringParameters.per_page || 10
  const page = event.queryStringParameters.page || 0
  const query = event.queryStringParameters.query
  const management = getAuth0Client()

  const params: any = {
    per_page: perPage,
    page: page,
    include_totals: true
  }

  if (query) {
    params.q = query
  }

  const response = await management.users.getAll(params)
  return {
    statusCode: 200,
    body: JSON.stringify(response.data)
  }
}

export async function get(event: any) {
  const userId = event.pathParameters ? atob(event.pathParameters.id) : null
  const management = getAuth0Client()

  const params: any = {
    id: userId
  }

  const response = await management.users.get(params)
  return {
    statusCode: 200,
    body: JSON.stringify(response.data)
  }
}
