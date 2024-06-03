import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb'
import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)
const tableName = process.env.EPISODES_TABLE

export const getEpisode = async (userId: string, feedId: string, id: string) => {
  const record = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        FeedId: feedId,
        Id: id
      }
    })
  )
  if (!record.Item || record.Item.UserId !== userId) return null
  return transformFromDb(record.Item)
}

export const getEpisodes = async (userId: string, feedId: string) => {
  const records = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'FeedId = :feedId',
      ExpressionAttributeValues: {
        ':feedId': feedId
      }
    })
  )
  console.log('Item count:', records.Items?.length)
  console.log('Response:', records)
  const filtered = records.Items?.filter((i: any) => i.UserId === userId)
  return filtered?.map(transformFromDb)
}

export const createEpisode = async (userId: string, feedId: string, episode: any) => {
  const id = uuidv4()
  const record: any = {
    Id: id,
    UserId: userId,
    FeedId: feedId,
    Title: episode.title,
    Guid: episode.guid,
    Author: episode.author,
    Url: episode.url,
    PublishedAt: episode.published_at,
    Duration: episode.duration,
    NeedsTranscription: true,
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString()
  }
  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: record
    })
  )
  return transformFromDb(record)
}

export const updateEpisode = async (feedId: string, id: string, episode: any) => {
  const record: any = {
    Id: id,
    UpdatedAt: new Date().toISOString(),
    Title: episode.title
  }
  const updateExpression = Object.keys(record)
    .map((i: any) => `#${i} = :value${i}`)
    .join(', ')
  const expressionAttributeValues = Object.keys(record).reduce(
    (acc: any, i: any) => ({
      ...acc,
      [`:value${i}`]: record[i]
    }),
    {}
  )

  const expressionAttributeNames = Object.keys(record).reduce(
    (acc: any, i: any) => ({
      ...acc,
      [`#${i}`]: i
    }),
    {}
  )
  await dynamo.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        FeedId: feedId,
        Id: id
      },
      UpdateExpression: 'SET ' + updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: {
        ...expressionAttributeValues
      }
    })
  )
  return transformFromDb(record)
}

export const deleteEpisode = async (feedId: string, id: string) => {
  await dynamo.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        FeedId: feedId,
        Id: id
      }
    })
  )
}

function transformFromDb(episode: any) {
  return {
    id: episode.Id,
    user_id: episode.UserId,
    feed_id: episode.FeedId,
    title: episode.Title,
    guid: episode.Guid,
    url: episode.Url,
    author: episode.Author,
    description: episode.Description,
    published_at: episode.PublishedAt,
    duration: episode.Duration,
    transcribed: !!episode.TranscriptUrl
  }
}

export async function needsTranscription() {
  const allRecords: any = []
  let lastEvaluatedKey: any = null
  const scan = async () => {
    const params: any = {
      TableName: tableName,
      FilterExpression: 'NeedsTranscription = :needsTranscription',
      ExpressionAttributeValues: {
        ':needsTranscription': true
      }
    }
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey
    }
    const records = await dynamo.send(new ScanCommand(params))
    if (records.Items) allRecords.push(...records.Items)
    return records.LastEvaluatedKey
  }
  while ((lastEvaluatedKey = await scan())) {}
  return allRecords.map(transformFromDb)
}

export async function updateTranscript(feedId: string, id: string, transcript: string) {
  await dynamo.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        FeedId: feedId,
        Id: id
      },
      UpdateExpression: 'SET TranscriptUrl = :transcript, NeedsTranscription = :needsTranscription',
      ExpressionAttributeValues: {
        ':transcript': transcript,
        ':needsTranscription': false
      }
    })
  )
}

/**
 * This function should only be used internally by the service since it does not scope the episode to the user.
 */
export async function getEpisodeById(feedId: string, id: string) {
  const record = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        FeedId: feedId,
        Id: id
      }
    })
  )
  return transformFromDb(record.Item)
}
