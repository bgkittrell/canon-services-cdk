// import OpenAI from 'openai'

// async function deleteAllFiles() {
//   const files = await openai.files.list()
//   for (const file of files.data) {
//     await openai.files.del(file.id)
//   }
// }

// async function deleteAllAssistants() {
//   let assistants = await openai.beta.assistants.list()
//   while (assistants.data.length > 0) {
//     for (const assistant of assistants.data) {
//       console.log('Deleting assistant:', assistant.id)
//       await openai.beta.assistants.del(assistant.id)
//     }
//     assistants = await openai.beta.assistants.list()
//   }
// }

// deleteAllFiles()
// deleteAllAssistants()
