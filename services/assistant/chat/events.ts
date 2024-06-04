import EventEmitter = require('events')
import OpenAI from 'openai'
import { RunStreamEvent } from 'openai/resources/beta/assistants'
import { RequiredActionFunctionToolCall, Run } from 'openai/resources/beta/threads/runs/runs'
import { executeTool } from '../tools'

class EventHandler extends EventEmitter {
  private client: OpenAI
  private outputStream: NodeJS.WritableStream
  private jwtToken: string

  constructor(client: OpenAI, outputStream: NodeJS.WritableStream, jwtToken: string) {
    super()
    this.client = client
    this.outputStream = outputStream
    this.jwtToken = jwtToken
    this.on('event', this.onEvent.bind(this))
  }

  async onEvent(event: RunStreamEvent) {
    try {
      console.log(event)
      if (event.event === 'thread.run.completed') {
        this.emit('done')
        return
      }
      const eventsToStream = [
        'thread.message.delta',
        'thread.message.created',
        'thread.message.completed',
        'thread.run.failed',
        'thread.run.step.failed',
        'error'
      ]
      // Retrieve events that are denoted with 'requires_action'
      // since these will have our tool_calls
      if (event.event === 'thread.run.requires_action') {
        await this.handleRequiresAction(event.data, event.data.id, event.data.thread_id)
      } else if (eventsToStream.includes(event.event)) {
        await this.handleStreamToClient(event)
      }
    } catch (error) {
      console.error('Error handling event:', error)
      this.emit('error', error)
    }
  }

  async handleStreamToClient(event: RunStreamEvent) {
    this.outputStream.write(JSON.stringify(event) + '\n')
  }

  async handleRequiresAction(data: Run, runId: string, threadId: string) {
    try {
      if (!data.required_action || !data.required_action.submit_tool_outputs) {
        return
      }
      const context = {
        jwtToken: this.jwtToken
      }
      const toolOutputCalls = data.required_action.submit_tool_outputs.tool_calls.map(
        async (toolCall: RequiredActionFunctionToolCall) => ({
          tool_call_id: toolCall.id,
          output: JSON.stringify(await executeTool(toolCall, context))
        })
      )
      const toolOutputs = await Promise.all(toolOutputCalls)
      console.log('Tool outputs:', toolOutputs)
      // Submit all the tool outputs at the same time
      await this.submitToolOutputs(toolOutputs, runId, threadId)
    } catch (error) {
      console.error('Error processing required action:', error)
    }
  }

  async submitToolOutputs(toolOutputs: any, runId: string, threadId: string) {
    try {
      // Use the submitToolOutputsStream helper
      const stream = this.client.beta.threads.runs.submitToolOutputsStream(threadId, runId, {
        tool_outputs: toolOutputs
      })
      for await (const event of stream) {
        this.emit('event', event)
      }
    } catch (error) {
      console.error('Error submitting tool outputs:', error)
    }
  }
}

export default EventHandler
