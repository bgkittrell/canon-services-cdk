import { publish } from '../../core/messages'
import { getUserId } from '../../core/auth'
import { getEpisode, getEpisodes, createEpisode, updateEpisode, deleteEpisode } from './db'

export async function list(event: any) {
  const userId = getUserId(event)
  const feedId = event.pathParameters.feedId

  const episodes = await getEpisodes(userId, feedId)

  return {
    statusCode: 200,
    body: JSON.stringify(episodes)
  }
}

export async function get(event: any) {
  const id = event.pathParameters.id
  const feedId = event.pathParameters.feedId
  const userId = getUserId(event)

  const episode = await getEpisode(feedId, userId, id)

  return {
    statusCode: 200,
    body: JSON.stringify(episode)
  }
}

export async function create(event: any) {
  const episode = JSON.parse(event.body)

  const userId = getUserId(event)
  const feedId = event.pathParameters.feedId

  const newEpisode = await createEpisode(userId, feedId, episode)

  await publish('services.podcasts', 'episode.created', {
    episode: newEpisode
  })

  return {
    statusCode: 201,
    body: JSON.stringify(newEpisode)
  }
}

export async function update(event: any) {
  const id = event.pathParameters.id
  const userId = getUserId(event)
  const episode = JSON.parse(event.body)

  const updatedEpisode = await updateEpisode(userId, id, episode)

  await publish('services.podcasts', 'episode.updated', {
    episode: updatedEpisode
  })

  return {
    statusCode: 200,
    body: JSON.stringify(updatedEpisode)
  }
}

export async function destroy(event: any) {
  console.log('event', event)
  const id = event.pathParameters.id
  const userId = getUserId(event)

  await deleteEpisode(userId, id)

  await publish('services.podcasts', 'episode.deleted', {
    episode: {
      id
    }
  })

  return {
    statusCode: 204,
    body: ''
  }
}
