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
const tableName = process.env.FEEDS_TABLE

export const getFeed = async (userId: string, id: string) => {
  const record = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        UserId: userId,
        Id: id
      }
    })
  )
  if (!record.Item || record.Item.UserId !== userId) return null
  return transformFromDb(record.Item)
}

export const getFeeds = async (userId: string) => {
  const records = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'UserId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    })
  )
  return records.Items?.map(transformFromDb)
}

export const createFeed = async (userId: string, feed: any) => {
  const id = uuidv4()
  const record: any = {
    Id: id,
    UserId: userId,
    FeedName: feed.feed_name,
    Url: feed.url,
    Md5Hash: feed.md5_hash,
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

export const updateFeed = async (userId: string, id: string, feed: any) => {
  const record: any = {
    Id: id,
    UpdatedAt: new Date().toISOString(),
    FeedName: feed.feed_name
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
        UserId: userId,
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

export const deleteFeed = async (userId: string, id: string) => {
  await dynamo.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        UserId: userId,
        Id: id
      },
      ConditionExpression: 'UserId = :userid',
      ExpressionAttributeValues: {
        ':userid': userId
      }
    })
  )
}

function transformFromDb(feed: any) {
  return {
    id: feed.Id,
    user_id: feed.UserId,
    feed_name: feed.FeedName,
    created_at: feed.CreatedAt,
    url: feed.Url,
    md5_hash: feed.Md5Hash
  }
}
