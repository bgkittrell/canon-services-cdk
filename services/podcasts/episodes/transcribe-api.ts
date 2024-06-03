import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { publish } from '../../core/messages'
import { updateTranscript, needsTranscription, getEpisodeById } from './db'

const s3client = new S3Client({})

const transcriptBucket = process.env.TRANSCRIPT_BUCKET

export async function getNeedsTranscription(event: any) {
  const episodes = await needsTranscription()

  return {
    statusCode: 200,
    body: JSON.stringify(episodes)
  }
}

export async function update(event: any) {
  console.log('Event:', event)
  const id = event.pathParameters.id
  const feedId = event.pathParameters.feedId
  const body = JSON.parse(event.body)

  const episode = await getEpisodeById(feedId, id)
  if (!episode) {
    return {
      statusCode: 404
    }
  }
  const transcriptHeader = `
    This is the transcript for ${episode.title} by ${episode.author}
    Published on ${episode.published_at}
    The following is a text transcript of the episode:

  `
  await writeStringToS3(id, transcriptHeader + body.transcript)
  const transcriptUrl = `https://${transcriptBucket}.s3.amazonaws.com/${id}.txt`
  await updateTranscript(feedId, id, transcriptUrl)

  await publish('services.podcasts', 'episode.transcribed', {
    episode: {
      ...episode,
      transcript_url: transcriptUrl
    }
  })

  return {
    statusCode: 200
  }
}

async function writeStringToS3(key: string, body: string) {
  const command = new PutObjectCommand({
    Bucket: transcriptBucket,
    Key: `${key}.txt`,
    Body: body
  })

  await s3client.send(command)
}
