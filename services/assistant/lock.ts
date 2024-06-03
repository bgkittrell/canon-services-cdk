import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const tableName = process.env.LOCKS_TABLE

export const acquireLock = async (userId: string) => {
  console.log('Acquiring lock')
  console.log('userId', userId)

  const params = {
    TableName: tableName,
    Item: {
      Id: userId,
      LockStatus: true,
      Timestamp: `${Date.now()}`
    },
    ConditionExpression: 'attribute_not_exists(LockStatus) OR LockStatus = :status',
    ExpressionAttributeValues: {
      ':status': false
    }
  }

  try {
    await dynamo.send(new PutCommand(params))
    console.log('Lock acquired')
    return true
  } catch (error: any) {
    if (error.code === 'ConditionalCheckFailedException') {
      console.log('Lock is already held')
      return false
    } else {
      console.error('Unexpected error occurred:', error)
      throw error
    }
  }
}

export const releaseLock = async (userId: string) => {
  console.log('Releasing lock')
  console.log('userId', userId)
  const params = {
    TableName: tableName,
    Key: {
      Id: userId
    },
    UpdateExpression: 'SET LockStatus = :status',
    ExpressionAttributeValues: {
      ':status': false
    }
  }

  try {
    await dynamo.send(new UpdateCommand(params))
    console.log('Lock released')
  } catch (error) {
    console.error('Failed to release lock:', error)
    throw error
  }
}
