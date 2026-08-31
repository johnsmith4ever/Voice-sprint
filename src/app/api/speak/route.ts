import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const primaryKey  = process.env.DEEPGRAM_API_KEY_PRIMARY
  const fallbackKey = process.env.DEEPGRAM_API_KEY_FALLBACK

  if (!primaryKey) {
    return NextResponse.json({ error: 'Deepgram primary key not configured' }, { status: 500 })
  }

  let text = ''
  try {
    const body = await req.json()
    text = body.text
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!text) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  // Currently Deepgram Aura TTS is optimized for English, but we'll use a clear voice
  const model = 'aura-asteria-en'
  const url = `https://api.deepgram.com/v1/speak?model=${model}`

  async function callTTS(apiKey: string) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
  }

  let res = await callTTS(primaryKey)

  if ((res.status === 401 || res.status === 429) && fallbackKey) {
    res = await callTTS(fallbackKey)
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    console.error('Deepgram TTS error:', res.status, errorText)
    return NextResponse.json({ error: `TTS failed with ${res.status}` }, { status: 502 })
  }

  const audioBuffer = await res.arrayBuffer()
  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
    },
  })
}
