import OpenAI from 'openai'
import * as fs from 'fs'
import fetch from 'node-fetch'
const openai = new OpenAI()
import { functions } from './tools'
import { create } from 'domain'

const downloadFile = (url: string) => {
  console.log('Downloading file:', url)
  const filename = '/tmp/' + url.split('/').pop()
  return new Promise((resolve, reject) => {
    fetch(url).then(function (res) {
      if (!res.body) {
        reject('No body')
        return
      }
      var fileStream = fs.createWriteStream(filename)
      res.body.on('error', reject)
      fileStream.on('finish', () => resolve(filename))
      res.body.pipe(fileStream)
    })
  })
}

export const createFile = async (url: string) => {
  const downloadedFile = await downloadFile(url)
  if (!downloadedFile) {
    throw new Error('Failed to download file')
  }
  const file = await openai.files.create({
    file: fs.createReadStream(downloadedFile as string),
    purpose: 'assistants'
  })
  console.log(file)
  return file
}

export const deleteFile = async (storageFileId: string) => {
  return await openai.files.del(storageFileId)
}

export const createVectorStoreFile = async (vectorStoreId: string, storageFile: any) => {
  const vectorStoreFile = await openai.beta.vectorStores.files.create(vectorStoreId, {
    file_id: storageFile.id
  })
  console.log(vectorStoreFile)
  return vectorStoreFile
}

export const deleteVectorStoreFile = async (vectorStoreId: string, vectorStoreFileId: string) => {
  return await openai.beta.vectorStores.files.del(vectorStoreId, vectorStoreFileId)
}

export const createAssistant = async () => {
  let instructions = getInstructions()
  console.log('Creating assistant with instructions:', instructions)
  const assistant = await openai.beta.assistants.create({
    instructions,
    name: 'Podcast Assistant',
    model: 'gpt-4o',
    tools: [...functions, { type: 'file_search' }, { type: 'code_interpreter' }]
  })
  console.log('Created assistant:', assistant)
  const vectorStore = await createVectorStore()
  console.log('Created vector store:', vectorStore)
  await openai.beta.assistants.update(assistant.id, {
    tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } }
  })
  return { assistant, vectorStore }
}

export const updateAssistant = async (assistantId: string) => {
  let instructions = getInstructions()
  console.log('Updating assistant with instructions:', instructions)
  await openai.beta.assistants.update(assistantId, {
    name: 'Podcast Assistant',
    instructions,
    model: 'gpt-4o',
    tools: [...functions, { type: 'file_search' }, { type: 'code_interpreter' }]
  })
  let vectorStoreId = await getVectorStoreId(assistantId)
  if (!vectorStoreId) {
    vectorStoreId = (await createVectorStore()).id
    await openai.beta.assistants.update(assistantId, {
      tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } }
    })
    console.log('Updated assistant with new vector store:', vectorStoreId)
  }
  return vectorStoreId
}

function getInstructions() {
  let instructions = `You are an AI agent that helps people find podcast episodes to listen to.
  In your files you have access to transcripts of podcast episodes.
  You may be asked to answer questions about the episodes or provide summaries.
  You also have access to functions that can help you.`
  return instructions
}

export const createVectorStore = async () => {
  return await openai.beta.vectorStores.create({
    name: 'Podcast Transcripts'
  })
}

export const getVectorStoreId = async (assistantId: string) => {
  const assistant = await openai.beta.assistants.retrieve(assistantId)
  return assistant.tool_resources?.file_search?.vector_store_ids?.[0] // Fix: Added nullish coalescing operator
}
