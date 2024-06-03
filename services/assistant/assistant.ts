import OpenAI from 'openai'
import * as fs from 'fs'
import fetch from 'node-fetch'
const openai = new OpenAI()

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
  const assistant = await openai.beta.assistants.create({
    instructions:
      'You are an authors assistant. You have access to the authors books in your files.',
    name: 'Author Assistant',
    model: 'gpt-4-turbo',
    tools: [{ type: 'file_search' }]
  })
  console.log('Created assistant:', assistant)
  const vectorStore = await createVectorStore()
  console.log('Created vector store:', vectorStore)
  await openai.beta.assistants.update(assistant.id, {
    tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } }
  })
  return { assistant, vectorStore }
}

const createVectorStore = async () => {
  return await openai.beta.vectorStores.create({
    name: 'Books'
  })
}

export const getVectorStoreId = async (assistantId: string) => {
  const assistant = await openai.beta.assistants.retrieve(assistantId)
  return assistant.tool_resources?.file_search?.vector_store_ids?.[0] // Fix: Added nullish coalescing operator
}
