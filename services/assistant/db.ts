import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)
const chatSessionTableName = process.env.CHAT_SESSIONS_TABLE
const assistansTableName = process.env.ASSISTANTS_TABLE

export const getAssistantByUserId = async (userId: string) => {
  const records = await dynamo.send(
    new QueryCommand({
      TableName: assistansTableName,
      KeyConditionExpression: 'UserId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    })
  )
  console.log('Records:', records)
  if (!records.Items || records.Items.length === 0) {
    return null
  }
  return transformFromDb(records.Items[0])
}

export const createAssistant = async (userId: string, openAiAssistantId: string) => {
  const id = uuidv4()
  const record: any = {
    Id: id,
    UserId: userId,
    OpenAiAssistantId: openAiAssistantId,
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString()
  }
  await dynamo.send(
    new PutCommand({
      TableName: assistansTableName,
      Item: record
    })
  )
  return transformFromDb(record)
}

export const createChatSession = async (
  userId: string,
  assistantId: string,
  threadId: string,
  jwtToken: string
) => {
  const id = uuidv4()
  const record: any = {
    Id: id,
    UserId: userId,
    AssistantId: assistantId,
    ThreadId: threadId,
    JwtToken: jwtToken,
    CreatedAt: new Date().toISOString()
  }
  await dynamo.send(
    new PutCommand({
      TableName: chatSessionTableName,
      Item: record
    })
  )
  return id
}

export const getChatSession = async (id: string) => {
  const item = await dynamo.send(
    new GetCommand({
      TableName: chatSessionTableName,
      Key: {
        Id: id
      }
    })
  )
  if (!item.Item) {
    return null
  }
  return {
    id: item.Item.Id,
    user_id: item.Item.UserId,
    assistant_id: item.Item.AssistantId,
    thread_id: item.Item.ThreadId,
    jwt_token: item.Item.JwtToken
  }
}

function transformFromDb(file: any) {
  return {
    id: file.Id,
    user_id: file.UserId,
    openai_assistant_id: file.OpenAiAssistantId,
    created_at: file.CreatedAt,
    updated_at: file.UpdatedAt
  }
}
