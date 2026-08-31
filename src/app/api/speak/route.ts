import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let text = ''
  let language = 'en'
  try {
    const body = await req.json()
    text = body.text
    language = body.language || 'en'
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!text) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  // Proxy Google Translate TTS for highly accurate language-specific accents
  const tl = language.split('-')[0] // 'fr-FR' -> 'fr'
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${tl}&client=tw-ob`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    })
    
    if (!res.ok) {
      console.error('Translate TTS error:', res.status)
      return NextResponse.json({ error: `TTS failed with ${res.status}` }, { status: 502 })
    }

    const audioBuffer = await res.arrayBuffer()
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    })
  } catch (e) {
    console.error('Fetch to Translate TTS failed:', e)
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  }
}
