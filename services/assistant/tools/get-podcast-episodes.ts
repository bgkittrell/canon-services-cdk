import axios from 'axios'
const podcastApiUrl = process.env.PODCAST_API_URL

export default async function getPodcastEpisodes(jwtToken: string, feedId: string) {
  if (!podcastApiUrl) {
    throw new Error('PODCAST_API_URL is not set.')
  }
  const response = await axios.get(`${podcastApiUrl}/feeds/${feedId}/episodes`, {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    }
  })
  return response.data
}
