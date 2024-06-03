import Stripe from 'stripe'
import { publish } from '../core/messages'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getSubscriptionStripeId
} from './db'

export const handler = async (event: any) => {
  console.log('Event:', event)
  console.log('Body: ', event.body)
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_ENDPOINT_SECRET) {
    throw new Error('Stripe secret key or endpoint secret is not defined')
  }
  const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY)
  const sig = event.headers['stripe-signature']
  console.log('Body: ', event.body)
  const stripeEvent = stripeClient.webhooks.constructEvent(event.body, sig, endpointSecret)

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
      await handleCheckoutSessionCompleted(stripeEvent)
      break
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
      await handleSubscriptionDeleted(stripeEvent)
      break
    default:
      console.log('Unhandled event type:', stripeEvent.type)
  }

  return {
    statusCode: 200,
    body: 'Processed webhook event'
  }
}

async function handleSubscriptionDeleted(stripeEvent: any) {
  const subscription = stripeEvent.data.object
  console.log('Subscription:', subscription)
  if (!subscription.id) {
    throw new Error('Missing subscription ID')
  }

  const currentSubscription = await getSubscriptionStripeId(subscription.id)
  console.log('Current subscription:', currentSubscription)

  await deleteSubscription(currentSubscription.user_id, currentSubscription.id)

  await publish('services.stripe', 'subscription.deleted', {
    user_id: subscription.client_reference_id,
    subscription_id: subscription.id
  })
}

async function handleCheckoutSessionCompleted(stripeEvent: any) {
  const session = stripeEvent.data.object
  console.log('Session:', session)
  if (!session.client_reference_id || !session.subscription || !session.customer) {
    throw new Error('Missing required fields in session object')
  }
  let userId = session.client_reference_id
  let count = 0
  while (userId.length % 4 && count++ < 100) {
    userId += '=' // Add '=' padding if necessary
  }
  userId = atob(userId)
  await createSubscription(userId, session.subscription as string, session.customer as string)
  await publish('services.stripe', 'subscription.created', {
    user_id: session.client_reference_id,
    subscription_id: session.subscription,
    customer_id: session.customer
  })
}
