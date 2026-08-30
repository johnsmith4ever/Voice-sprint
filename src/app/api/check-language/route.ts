import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

const LANG_NAMES: Record<string, string> = {
  'en-US': 'English', 'es-ES': 'Spanish', 'fr-FR': 'French', 'de-DE': 'German',
}

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  let questions: string[] = [], language = 'en-US'
  try {
    const body = await req.json()
    questions  = body.questions ?? []
    language   = body.language  ?? 'en-US'
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const sample = questions.slice(0, 5).join('\n').trim()
  if (!sample) {
    return NextResponse.json({ match: true, detectedLanguage: LANG_NAMES[language] ?? language, note: '' })
  }

  const selectedLangName = LANG_NAMES[language] ?? language

  const prompt = `You are a language detection expert.
Analyze the language of the following questions and determine if they are written in ${selectedLangName}.
Return ONLY valid JSON — no markdown:
{
  "match": boolean,
  "detectedLanguage": "the language name you detected",
  "confidence": "high | medium | low",
  "note": "short friendly one-sentence message if mismatched, empty string if matched"
}

Questions:
${sample}`

  try {
    const client = new GoogleGenAI({ apiKey: key })
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    })

    const text = response.text ?? ''
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('No JSON in response')
      parsed = JSON.parse(m[0])
    }

    return NextResponse.json({
      match:            !!parsed.match,
      detectedLanguage: parsed.detectedLanguage ?? 'Unknown',
      confidence:       parsed.confidence        ?? 'medium',
      note:             parsed.note              ?? '',
      selectedLanguage: selectedLangName,
    })
  } catch (e: any) {
    console.error('Language check error:', e?.message || e)
    return NextResponse.json({ error: 'Check failed' }, { status: 500 })
  }
}
