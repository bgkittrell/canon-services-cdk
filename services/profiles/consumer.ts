import { ManagementClient } from 'auth0'
import { EventBridgeEvent } from 'aws-lambda/trigger/eventbridge'

const auth0Domain = process.env.AUTH0_DOMAIN
const clientId = process.env.AUTH0_CLIENT_ID
const clientSecret = process.env.AUTH0_CLIENT_SECRET
export const handler = async (event: EventBridgeEvent<any, any>) => {
  console.log('Event:', event)
  const message = event.detail
  const type = event['detail-type']
  if (type !== 'subscription.created') return
  switch (type) {
    case 'subscription.created':
      const userId = message.user_id
      const metadata = {
        app_metadata: {
          stripe_subscription_id: message.subscription_id,
          stripe_customer_id: message.customer_id
        }
      }
      await updateMetadata(userId, metadata)
      break
    default:
      console.log('Unhandled event type:', type)
  }
}

async function updateMetadata(userId: string, metadata: any) {
  if (!auth0Domain || !clientId || !clientSecret) {
    throw new Error('Auth0 environment variables not set')
  }
  const management = new ManagementClient({
    domain: auth0Domain,
    clientId: clientId,
    clientSecret: clientSecret
  })

  const params = { id: userId }
  await management.users.update(params, metadata)
}
