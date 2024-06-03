import { publish } from '../../core/messages'
import { getUserId } from '../../core/auth'

import { getFeed, getFeeds, createFeed, updateFeed, deleteFeed } from './db'

export async function list(event: any) {
  const userId = getUserId(event)

  const feeds = await getFeeds(userId)

  return {
    statusCode: 200,
    body: JSON.stringify(feeds)
  }
}

export async function get(event: any) {
  const id = event.pathParameters.id
  const userId = getUserId(event)

  const feed = await getFeed(userId, id)

  return {
    statusCode: 200,
    body: JSON.stringify(feed)
  }
}

export async function create(event: any) {
  const feed = JSON.parse(event.body)

  const userId = getUserId(event)

  const newFeed = await createFeed(userId, feed)

  await publish('services.podcasts', 'feed.created', {
    feed: newFeed
  })

  return {
    statusCode: 201,
    body: JSON.stringify(newFeed)
  }
}

export async function update(event: any) {
  const id = event.pathParameters.id
  const userId = getUserId(event)
  const feed = JSON.parse(event.body)

  const updatedFeed = await updateFeed(userId, id, feed)

  await publish('services.podcasts', 'feed.updated', {
    feed: updatedFeed
  })

  return {
    statusCode: 200,
    body: JSON.stringify(updatedFeed)
  }
}

export async function destroy(event: any) {
  console.log('event', event)
  const id = event.pathParameters.id
  const userId = getUserId(event)

  await deleteFeed(userId, id)

  await publish('services.podcasts', 'feed.deleted', {
    feed: {
      id
    }
  })

  return {
    statusCode: 204,
    body: ''
  }
}
