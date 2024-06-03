import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const chatSessionTableName = process.env.CHAT_SESSIONS_TABLE

import OpenAI from 'openai'
const openai = new OpenAI()

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
  try {
    const body = JSON.parse(event.body)
    const sessionId = event.queryStringParameters.session_id

    // Get the chat session from the database
    const session = await getChatSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    const threadId = session.thread_id
    const assistantId = session.assistant_id

    // Get the message and instructions from the request
    const instructions = body.instructions
    const messageText = body.message

    // Send the user message to the thread
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: messageText })

    // Stream the thread events to the response stream
    const stream = await openai.beta.threads.runs
      .stream(threadId, {
        assistant_id: assistantId,
        additional_instructions: instructions
      })
      .on('event', async (event) => {
        // The newline character is required to separate the events
        responseStream.write(JSON.stringify(event) + '\n')
      })
    await stream.finalRun()
  } catch (error) {
    console.error(error)
    responseStream.write(JSON.stringify({ error: error.message }))
  } finally {
    responseStream.end()
  }
})

export const getChatSession = async (id) => {
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
    thread_id: item.Item.ThreadId
  }
}
