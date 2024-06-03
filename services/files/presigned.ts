import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3Client, PutObjectCommand, PutObjectRequest } from '@aws-sdk/client-s3'
const client = new S3Client({})
// Change this value to adjust the signed URL's expiration
const URL_EXPIRATION_SECONDS = 300

const getUploadURL = async function (event: any) {
  const fileName = event.queryStringParameters.filename

  // Expires in 7 days
  var exp = new Date()
  exp.setDate(exp.getDate() + 7)

  // Get signed URL from S3
  const s3Params: PutObjectRequest = {
    Bucket: process.env.BUCKET_NAME,
    Key: fileName
  }

  console.log('getUploadURL: ', s3Params)
  const command = new PutObjectCommand(s3Params)
  const url = await getSignedUrl(client, command, { expiresIn: URL_EXPIRATION_SECONDS })

  return JSON.stringify({
    presigned_url: url
  })
}

export { getUploadURL }
