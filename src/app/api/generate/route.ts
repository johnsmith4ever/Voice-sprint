import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

interface GeneratedQuestion {
  prompt: string
  keyTerms: string[]
  expectedAnswer?: string
}

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  let notes = '', count = 5, includeAnswers = false
  try {
    const body = await req.json()
    notes          = body.notes    ?? ''
    count          = Math.min(Math.max(Number(body.count) || 5, 1), 15)
    includeAnswers = Boolean(body.includeAnswers)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!notes.trim()) return NextResponse.json({ error: 'Notes are required' }, { status: 400 })

  const answerInstruction = includeAnswers
    ? 'Each object must also have an "expectedAnswer" field: a concise, spoken-length answer (1-3 sentences) in the same language as the question.'
    : ''

  const schema = includeAnswers
    ? '{ "prompt": "question text", "keyTerms": ["term1"], "expectedAnswer": "short model answer" }'
    : '{ "prompt": "question text", "keyTerms": ["term1"] }'

  const prompt = `You are an oral exam question generator.
Detect the language of the study notes below and generate exactly ${count} practice questions IN THAT SAME LANGUAGE -- do not translate.
Each question should be open-ended and conversational, suitable for a 15-second spoken answer.
${answerInstruction}
Return ONLY valid JSON matching this schema exactly -- no markdown, no extra keys:
{
  "questions": [
    ${schema}
  ]
}
Notes:
${notes}`

  try {
    const client = new GoogleGenAI({ apiKey: key })
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    })

    const text = response.text ?? ''
    let parsed: { questions?: GeneratedQuestion[] }
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('No JSON found')
      parsed = JSON.parse(m[0])
    }

    const questions = parsed?.questions
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'No questions returned' }, { status: 502 })
    }

    return NextResponse.json({ questions })
  } catch (e: any) {
    console.error('Generation error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 })
  }
}
