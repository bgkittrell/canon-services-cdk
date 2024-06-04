import {
  createAssistant,
  createVectorStoreFile,
  getVectorStoreId,
  createFile,
  deleteVectorStoreFile,
  deleteFile,
  updateAssistant,
  createVectorStore
} from './assistant.js'

import { getAssistantByUserId, createAssistant as saveAssistant } from './db.js'
import { acquireLock, releaseLock } from './lock.js'
import { publish } from '../core/messages'

import { EventBridgeEvent } from 'aws-lambda/trigger/eventbridge'
import { getEpisode, getEpisodes } from '../podcasts/episodes/db.js'

export const handler = async (event: EventBridgeEvent<any, any>) => {
  console.log('Event:', event)
  const message = event.detail
  const type = event['detail-type']
  switch (type) {
    case 'file.created':
      const url = message.file.url
      const fileId = message.file.id
      const userId = message.file.user_id

      return await onFileCreated(url, userId, fileId)
    case 'file.deleted':
      const file = message.file
      return await onFileDeleted(file)
    case 'episode.transcribed':
      return await onEpisodeTranscribed(message.episode)
    default:
      return {
        body: 'Method Not Allowed'
      }
  }
}
async function onFileDeleted(file: any) {
  if (!file) {
    throw new Error('No file provided')
  }

  console.log('Deleting file:', file)
  await deleteVectorStoreFile(file.vector_store_id, file.vector_store_file_id)
  await deleteFile(file.storage_file_id)
  return {
    body: 'File deleted'
  }
}
async function onFileCreated(url: string, userId: string, fileId: string) {
  try {
    const { storageFile, vectorStoreFile, vectorStoreId } = await sendToVectorStore(url, userId)
    await publish('services.assistant', 'assistant.file.created', {
      user_id: userId,
      file_id: fileId,
      storage_file_id: storageFile.id,
      vector_store_id: vectorStoreId,
      vector_store_file_id: vectorStoreFile.id
    })

    return {
      body: JSON.stringify({
        storage_file: storageFile,
        assistant_file: vectorStoreFile
      })
    }
  } catch (error: any) {
    console.error('Error in onFileCreated:', error)
    await publish('services.assistant', 'assistant.file.error', {
      user_id: userId,
      file_id: fileId,
      error: error.message
    })
    throw error
  }
}
async function sendToVectorStore(url: string, userId: string) {
  if (!url) {
    throw new Error('No URL provided')
  }

  let assistantId
  let vectorStoreId
  // Using a semaphore lock to prevent concurrent assistant creation
  await lockAssistant(userId, async () => {
    const response = await upsertAssistant(userId)
    assistantId = response.assistantId
    vectorStoreId = response.vectorStoreId
  })

  console.log('Assistant ID:', assistantId)
  console.log('Vector Store ID:', vectorStoreId)
  if (!assistantId || !vectorStoreId) {
    throw new Error('Assistant not found')
  }

  const storageFile = await createFile(url)
  const vectorStoreFile = await createVectorStoreFile(vectorStoreId, storageFile)

  return { storageFile, vectorStoreFile, vectorStoreId }
}

async function upsertAssistant(userId: string) {
  let assistantId = (await getAssistantByUserId(userId))?.openai_assistant_id
  let vectorStoreId
  if (!assistantId) {
    const { assistant, vectorStore } = await createAssistant()
    await saveAssistant(userId, assistant.id)
    vectorStoreId = vectorStore.id
    assistantId = assistant.id
  } else {
    vectorStoreId = await updateAssistant(assistantId)
  }
  return { assistantId, vectorStoreId }
}

async function lockAssistant(userId: any, callback: any) {
  try {
    const locked = await acquireLock(userId)
    if (!locked) {
      throw new Error('Could not acquire lock try again later')
    }

    await callback()
  } catch (error) {
    console.error('Error in lockAssistant:', error)
    throw error
  } finally {
    console.log('Finally release lock')
    await releaseLock(userId)
  }
}

async function onEpisodeTranscribed(episode: any) {
  if (!episode) {
    throw new Error('No episode provided')
  }

  await sendToVectorStore(episode.transcript_url, episode.user_id)
}
