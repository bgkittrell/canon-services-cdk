import Stripe from 'stripe'
import { getSubscriptionByUserId } from './db'
import { getUserId } from '../core/auth'

export async function createPortalSession(event: any) {
  console.log('Event:', event)
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    throw new Error('Stripe secret key is not defined')
  }
  const stripeClient = new Stripe(stripeKey)

  const userId = getUserId(event)

  const body = JSON.parse(event.body)
  const redirectUrl = body.redirect_url

  async function getBillingPortalSession(userId: string) {
    const subscription = await getSubscriptionByUserId(userId)
    if (!subscription) {
      return {
        statusCode: 404
      }
    }

    console.log('subscriptions:', subscription)

    const session = await stripeClient.billingPortal.sessions.create({
      customer: subscription.customer_id,
      return_url: redirectUrl
    })
    return session
  }

  const response: any = await getBillingPortalSession(userId)
  console.log('Response:', response)
  return {
    statusCode: 200,
    body: JSON.stringify({
      portalUrl: response.url
    })
  }
}

export async function getSubscription(event: any) {
  const userId = getUserId(event)
  console.log('User ID:', userId)
  const subscription = await getSubscriptionByUserId(userId)
  console.log('Subscription:', subscription)
  if (!subscription) {
    return {
      statusCode: 404
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ subscription })
  }
}
