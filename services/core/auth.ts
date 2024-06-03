export function getUserId(event: any) {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub
  if (!userId) {
    throw new Error('Forbidden')
  }
  return userId
}
