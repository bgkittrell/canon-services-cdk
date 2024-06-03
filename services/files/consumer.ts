import { EventBridgeEvent } from 'aws-lambda/trigger/eventbridge'
import { updateAssistant, updateFileError } from './db'

export const handler = async (event: EventBridgeEvent<any, any>) => {
  console.log('Event:', event)
  const message = event.detail
  const type = event['detail-type']
  switch (type) {
    case 'assistant.file.created':
      await updateAssistant(
        message.user_id,
        message.file_id,
        message.storage_file_id,
        message.vector_store_id,
        message.vector_store_file_id
      )
      return
    case 'assistant.file.error':
      await updateFileError(message.user_id, message.file_id, message.error)
      return
    default:
      return {
        body: 'Method Not Allowed'
      }
  }
}
