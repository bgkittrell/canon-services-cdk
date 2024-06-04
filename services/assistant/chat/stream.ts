import EventHandler from './events'
import { getChatSession } from '../db'

import OpenAI from 'openai'
const openai = new OpenAI()

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
  console.log('Lambda function started')

  try {
    const body = JSON.parse(event.body || '{}')
    const sessionId = event.queryStringParameters?.session_id
    if (!sessionId) {
      throw new Error('Session ID is required')
    }

    console.log('Received message:', body.message)
    // Get the chat session from the database
    const session = await getChatSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    const threadId = session.thread_id
    const assistantId = session.assistant_id
    const jwtToken = session.jwt_token
    console.log('Thread ID:', threadId)

    // Get the message and instructions from the request
    const instructions = body.instructions
    const messageText = body.message

    // Send the user message to the thread
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: messageText })
    console.log('Sent message to thread:', messageText)

    const eventHandler = new EventHandler(openai, responseStream, jwtToken)
    eventHandler.on('done', () => {
      console.log('Done')
      responseStream.end()
    })
    console.log('Listening for events...')

    const stream = await openai.beta.threads.runs.stream(threadId, { assistant_id: assistantId })
    console.log('Streaming')

    for await (const event of stream) {
      eventHandler.emit('event', event)
    }
    console.log('Stream ended')
  } catch (error: any) {
    console.error(error)
    responseStream.write(JSON.stringify({ error: error.message }))
    responseStream.end()
  } finally {
    console.log('Lambda function finished')
  }
})
