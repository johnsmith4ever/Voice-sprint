import { NextRequest, NextResponse } from 'next/server'

const DG_ENDPOINT = 'https://api.deepgram.com/v1/listen'

// Map app language codes → Deepgram language codes
const LANG_MAP: Record<string, string> = {
  'en-US': 'en',
  'es-ES': 'es',
  'fr-FR': 'fr',
  'de-DE': 'de',
}

async function callDeepgram(
  audioBuffer: ArrayBuffer,
  mimeType: string,
  dgLang: string,
  apiKey: string,
): Promise<Response> {
  const params = new URLSearchParams({
    language:     dgLang,
    model:        'nova-2',
    punctuate:    'true',
    smart_format: 'true',
  })
  return fetch(`${DG_ENDPOINT}?${params}`, {
    method: 'POST',
    headers: {
      Authorization:  `Token ${apiKey}`,
      'Content-Type': mimeType || 'audio/webm',
    },
    body: audioBuffer,
  })
}

export async function POST(req: NextRequest) {
  const primaryKey  = process.env.DEEPGRAM_API_KEY_PRIMARY
  const fallbackKey = process.env.DEEPGRAM_API_KEY_FALLBACK

  if (!primaryKey) {
    return NextResponse.json({ error: 'Deepgram primary key not configured' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const audioFile = formData.get('audio') as File | null
  const language  = (formData.get('language') as string | null) ?? 'en-US'

  if (!audioFile) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  const dgLang      = LANG_MAP[language] ?? 'en'
  const mimeType    = audioFile.type || 'audio/webm'
  const audioBuffer = await audioFile.arrayBuffer()

  // Try primary key first
  let res = await callDeepgram(audioBuffer, mimeType, dgLang, primaryKey)

  // Retry with fallback on auth / rate-limit errors
  if ((res.status === 401 || res.status === 429) && fallbackKey) {
    console.warn(`Deepgram primary key failed (${res.status}), trying fallback…`)
    res = await callDeepgram(audioBuffer, mimeType, dgLang, fallbackKey)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('Deepgram error:', res.status, body)
    return NextResponse.json(
      { error: `Deepgram returned ${res.status}` },
      { status: 502 },
    )
  }

  const data = await res.json()
  const transcript: string =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

  return NextResponse.json({ transcript })
}
