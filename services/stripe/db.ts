import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'

const client = new DynamoDBClient()

const dynamo = DynamoDBDocumentClient.from(client)

import { DeleteCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

const tableName = process.env.SUBSCRIPTIONS_TABLE

export const createSubscription = async (
  userId: string,
  subscriptionId: string,
  customerId: string
) => {
  const id = uuidv4()
  const record: any = {
    Id: id,
    UserId: userId,
    SubscriptionId: subscriptionId,
    CustomerId: customerId,
    Status: 'ACTIVE',
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString()
  }
  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: record
    })
  )
  return record
}

export const updateSubscription = async (userId: string, id: string, status: string) => {
  await dynamo.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        UserId: userId,
        Id: id
      },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: {
        '#status': 'Status'
      },
      ExpressionAttributeValues: {
        ':status': status
      }
    })
  )
}

export const deleteSubscription = async (userId: string, id: string) => {
  await dynamo.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        UserId: userId,
        Id: id
      }
    })
  )
}

export const getSubscriptionByUserId = async (userId: string) => {
  const items = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'UserId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    })
  )
  if (!items.Items || items.Items.length === 0) {
    return null
  }

  const record = items.Items[0]
  return {
    id: record.Id,
    subscription_id: record.SubscriptionId,
    customer_id: record.CustomerId,
    status: record.Status
  }
}

export const getSubscriptionStripeId = async (subscriptionId: string) => {
  const items = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: 'SubscriptionId = :subscriptionId',
      ExpressionAttributeValues: {
        ':subscriptionId': subscriptionId
      }
    })
  )
  if (!items.Items || items.Items.length === 0) {
    throw new Error('Subscription not found')
  }
  const record = items.Items[0]
  return {
    id: record.Id,
    subscription_id: record.SubscriptionId,
    customer_id: record.CustomerId,
    user_id: record.UserId,
    status: record.Status
  }
}
