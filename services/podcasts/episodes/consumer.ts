import axios from 'axios'
import { parseFeed } from 'podcast-partytime'
import { publish } from '../../core/messages'
import { createEpisode } from './db'
import { EventBridgeEvent } from 'aws-lambda/trigger/eventbridge'

export const handler = async (event: EventBridgeEvent<any, any>) => {
  console.log('Event:', event)
  const message = event.detail
  const type = event['detail-type']
  switch (type) {
    case 'feed.created':
      await createEpisodes(message.feed)
      return
    case 'episode.ready':
      console.log('Episode:', message.episode)
      const newEpisode = await createEpisode(
        message.episode.user_id,
        message.episode.feed_id,
        message.episode
      )
      await publish('services.podcasts', 'episode.created', {
        episode: newEpisode
      })
      return
    default:
      return {
        body: 'Method Not Allowed'
      }
  }
}

async function createEpisodes(feed: any) {
  const feedXml = await axios.get(feed.url)
  console.log('Feed:', feedXml.data)

  const episodes = parseFeed(feedXml.data)
  console.log('Episodes:', episodes)
  if (!episodes) {
    throw new Error('No episodes found')
  }

  for (const episode of episodes.items) {
    await publish('services.podcasts', 'episode.ready', {
      episode: {
        user_id: feed.user_id,
        feed_id: feed.id,
        title: episode.title,
        description: episode.description,
        author: episode.author,
        url: episode.enclosure.url,
        published_at: episode.pubDate,
        duration: episode.duration,
        guid: episode.guid
      }
    })
  }
}
