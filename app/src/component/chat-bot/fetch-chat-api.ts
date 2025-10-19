export const fetchChatApi = async (
  requestPayload: string
): Promise<Response | null> => {
  try {
    const response = await fetch(
      process.env.REACT_APP_API_CHAT_STREAM_URL || '',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: requestPayload,
      }
    )
    return response
  } catch (err: any) {
    if (err.message === 'Failed to fetch') {
      console.error(
        'API error or CORS error detected, please API status or check bot allowed origins setting'
      )
    } else {
      console.error('Network error:', err)
    }
    return null
  }
}
