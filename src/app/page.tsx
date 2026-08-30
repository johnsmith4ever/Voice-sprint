'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = 'start' | 'sprint' | 'results'
type Language = 'en-US' | 'es-ES' | 'fr-FR' | 'de-DE'
interface QuestionResult { question: string; transcript: string }
interface LangOption { code: Language; label: string; flag: string }

// ─── Constants ────────────────────────────────────────────────────────────────
const QUESTION_TIME = 15
const SILENCE_THRESHOLD = 4000

const LANGUAGES: LangOption[] = [
  { code: 'en-US', label: 'English', flag: '🇬🇧' },
  { code: 'es-ES', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', label: 'French', flag: '🇫🇷' },
  { code: 'de-DE', label: 'German', flag: '🇩🇪' },
]

const CONFETTI_COLORS = ['#C6FF4D','#8C7BFF','#FF4D6D','#4DDBFF','#FFD166','#06D6A0']

// ─── Confetti piece component ─────────────────────────────────────────────────
function ConfettiPiece({ i }: { i: number }) {
  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
  const left   = `${(i * 7.3 + 5) % 97}%`
  const delay  = `${(i * 0.13) % 2.5}s`
  const dur    = `${2.4 + (i % 5) * 0.4}s`
  const size   = `${6 + (i % 4) * 4}px`
  const shape  = i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0%'
  return (
    <div style={{
      position: 'absolute', top: '-30px', left,
      width: size, height: size,
      background: color, borderRadius: shape,
      animation: `confettiFall ${dur} ${delay} ease-in forwards`,
      pointerEvents: 'none',
    }} />
  )
}

// ─── Waveform bars ─────────────────────────────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  const bars = 10
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 44 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: 4, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            width: '100%',
            height: active ? '100%' : '18%',
            borderRadius: 2,
            background: active
              ? `linear-gradient(to top, #8C7BFF, #C6FF4D)`
              : 'rgba(139,146,185,0.3)',
            transformOrigin: 'bottom',
            animation: active ? `waveBar ${0.6 + (i % 5) * 0.12}s ease-in-out infinite` : 'none',
            animationDelay: active ? `${i * 0.07}s` : '0s',
            transition: 'height 0.4s ease',
          }} />
        </div>
      ))}
    </div>
  )
}

// ─── Circular Timer ───────────────────────────────────────────────────────────
function CircularTimer({ timeLeft, total }: { timeLeft: number; total: number }) {
  const r = 54
  const circumference = 2 * Math.PI * r
  const progress = timeLeft / total
  const isLow = timeLeft <= 5
  const strokeColor = isLow ? '#FF4D6D' : timeLeft <= 9 ? '#FFD166' : '#C6FF4D'
  return (
    <div style={{ position: 'relative', width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)', animation: isLow ? 'timerPulse 0.8s ease-in-out infinite' : 'none' }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(139,146,185,0.1)" strokeWidth="8" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center'
      }}>
        <span className="font-display" style={{
          fontSize: 36, fontWeight: 700, lineHeight: 1,
          color: isLow ? '#FF4D6D' : '#F0F4FF',
          transition: 'color 0.5s',
        }}>{timeLeft}</span>
        <span style={{ fontSize: 11, color: '#8B92B9', marginTop: 2 }}>sec</span>
      </div>
    </div>
  )
}

// ─── Word-match utility ──────────────────────────────────────────────────────
function normalize(w: string) { return w.toLowerCase().replace(/[^\w]/g, '') }
function computeMatchedWords(expected: string[], spoken: string[]): boolean[] {
  const result = new Array(expected.length).fill(false)
  if (!spoken.length) return result
  let sIdx = 0
  for (let i = 0; i < expected.length; i++) {
    const exp = normalize(expected[i])
    if (!exp) { result[i] = true; continue }
    while (sIdx < spoken.length) {
      const spk = normalize(spoken[sIdx++])
      if (spk === exp || spk.startsWith(exp) || exp.startsWith(spk)) { result[i] = true; break }
    }
  }
  return result
}

// ─── MediaRecorder MIME helper ──────────────────────────────────────────────
function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VoiceSprint() {

  // ── State: navigation
  const [screen, setScreen] = useState<Screen>('start')

  // ── State: start screen
  const [questions, setQuestions]     = useState<string[]>([''])
  const [language, setLanguage]       = useState<Language>('en-US')
  const [showQPanel, setShowQPanel]   = useState(false)
  const [notesInput, setNotesInput]   = useState('')
  const [draftText, setDraftText]     = useState('')
  const [draftAnswers, setDraftAnswers] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateCount, setGenerateCount] = useState(5)
  const [customCountMode, setCustomCountMode] = useState(false)
  const [removingIdx, setRemovingIdx] = useState<number | null>(null)
  const [showQuestion, setShowQuestion] = useState(true)
  const [hasDefaultAnswers, setHasDefaultAnswers] = useState(false)
  const [answers, setAnswers] = useState<string[]>([''])

  // ── State: language check
  type LangCheckStatus = 'idle' | 'checking' | 'ok' | 'warn'
  const [langCheck, setLangCheck] = useState<{
    status: LangCheckStatus
    detectedLanguage?: string
    note?: string
  }>({ status: 'idle' })
  const langDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showMismatchModal, setShowMismatchModal] = useState(false)

  // ── State: answer language check
  const [answerLangCheck, setAnswerLangCheck] = useState<{
    status: LangCheckStatus
    detectedLanguage?: string
    note?: string
  }>({ status: 'idle' })
  const answerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── State: sprint
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft]         = useState(QUESTION_TIME)
  const [transcript, setTranscript]     = useState('')
  const [isRecording, setIsRecording]   = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [sprintError, setSprintError]   = useState<string | null>(null)
  const [qEntering, setQEntering]       = useState(false)

  // ── State: results
  const [results, setResults]       = useState<QuestionResult[]>([])
  const [revealCount, setRevealCount] = useState(0)

  // ── Refs (sprint state for stable callbacks)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<BlobPart[]>([])
  const streamRef        = useRef<MediaStream | null>(null)
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef    = useRef('')
  const resultsRef       = useRef<QuestionResult[]>([])
  const indexRef         = useRef(0)
  const validQsRef       = useRef<string[]>([])
  const answersRef       = useRef<string[]>([])
  const languageRef      = useRef(language)
  const isSubmittingRef  = useRef(false)
  // ref so finalizeQuestion can call startForIndex without circular useCallback dep
  const startForIndexRef = useRef<(idx: number) => void>(() => {})

  // ── Derived (must be above effects)
  const validQuestions = useMemo(
    () => questions.filter(q => q.trim().length > 0),
    [questions]
  )
  const canStart = validQuestions.length > 0

  useEffect(() => { languageRef.current = language }, [language])

  // ── Debounced language check
  useEffect(() => {
    if (validQuestions.length === 0) {
      setLangCheck({ status: 'idle' })
      return
    }
    if (langDebounceRef.current) clearTimeout(langDebounceRef.current)
    setLangCheck({ status: 'checking' })
    langDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/check-language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: validQuestions, language }),
        })
        if (!res.ok) { setLangCheck({ status: 'idle' }); return }
        const data = await res.json()
        if (data.error) { setLangCheck({ status: 'idle' }); return }
        setLangCheck({
          status: data.match ? 'ok' : 'warn',
          detectedLanguage: data.detectedLanguage,
          note: data.note,
        })
      } catch {
        setLangCheck({ status: 'idle' })
      }
    }, 1200)
    return () => { if (langDebounceRef.current) clearTimeout(langDebounceRef.current) }
  }, [validQuestions, language])

  // ── Debounced answer language check
  useEffect(() => {
    if (!hasDefaultAnswers) { setAnswerLangCheck({ status: 'idle' }); return }
    const validAnswers = answers.filter(a => a.trim().length > 0)
    if (validAnswers.length === 0) { setAnswerLangCheck({ status: 'idle' }); return }
    if (answerDebounceRef.current) clearTimeout(answerDebounceRef.current)
    setAnswerLangCheck({ status: 'checking' })
    answerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/check-language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: validAnswers, language }),
        })
        if (!res.ok) { setAnswerLangCheck({ status: 'idle' }); return }
        const data = await res.json()
        if (data.error) { setAnswerLangCheck({ status: 'idle' }); return }
        setAnswerLangCheck({
          status: data.match ? 'ok' : 'warn',
          detectedLanguage: data.detectedLanguage,
          note: data.note,
        })
      } catch { setAnswerLangCheck({ status: 'idle' }) }
    }, 1200)
    return () => { if (answerDebounceRef.current) clearTimeout(answerDebounceRef.current) }
  }, [answers, language, hasDefaultAnswers])


  // ────────────────────────────────────────────────────────
  //  Start screen handlers
  // ────────────────────────────────────────────────────────
  const updateAnswer   = (i: number, v: string) =>
    setAnswers(p => p.map((a, idx) => idx === i ? v : a))
  const addQuestion    = () => { setQuestions(p => [...p, '']); setAnswers(p => [...p, '']) }
  const updateQuestion = (i: number, v: string) =>
    setQuestions(p => p.map((q, idx) => idx === i ? v : q))

  const removeQuestion = (i: number) => {
    setRemovingIdx(i)
    setTimeout(() => {
      setQuestions(p => p.filter((_, idx) => idx !== i))
      setAnswers(p => p.filter((_, idx) => idx !== i))
      setRemovingIdx(null)
    }, 240)
  }

  const clearAll = () => { setQuestions(['']); setAnswers(['']); setShowQPanel(false) }

  const generateQuestions = async () => {
    if (!notesInput.trim()) return
    setIsGenerating(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // language intentionally omitted — route detects it from the notes text
        body: JSON.stringify({ notes: notesInput, count: generateCount, includeAnswers: hasDefaultAnswers }),
      })
      const data = await res.json()
      if (data.questions?.length) {
        setDraftText(data.questions.map((q: any) => q.prompt).join('\n'))
        if (hasDefaultAnswers) {
          setDraftAnswers(data.questions.map((q: any) => q.expectedAnswer ?? ''))
        } else {
          setDraftAnswers([])
        }
      }
    } catch (e) { console.error('Generation failed:', e) }
    finally { setIsGenerating(false) }
  }

  const insertDraft = () => {
    const lines = draftText.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length) {
      setQuestions(lines)
      // If we have generated answers, align them; pad/trim to match question count
      if (hasDefaultAnswers && draftAnswers.length > 0) {
        const aligned = lines.map((_, i) => draftAnswers[i] ?? '')
        setAnswers(aligned)
      } else {
        setAnswers(lines.map(() => ''))
      }
      setDraftAnswers([])
      setShowQPanel(false)
      setDraftText('')
      setNotesInput('')
    }
  }

  // ────────────────────────────────────────────────────────
  //  Sprint logic
  // ────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    // Stop MediaRecorder cleanly (onstop will not be called with transcript logic here)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    mediaRecorderRef.current = null
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    audioChunksRef.current = []
    setIsRecording(false)
    setIsTranscribing(false)
  }, [])

  // Async: moves to next Q or results screen after transcript is known
  const finalizeQuestion = useCallback((transcriptText: string) => {
    isSubmittingRef.current = false
    setIsTranscribing(false)
    setIsRecording(false)

    const idx = indexRef.current
    const vqs = validQsRef.current
    const result: QuestionResult = {
      question:   vqs[idx],
      transcript: transcriptText.trim() || '(no answer recorded)',
    }
    const updated = [...resultsRef.current, result]
    resultsRef.current = updated
    transcriptRef.current = transcriptText
    setTranscript(transcriptText)

    if (idx + 1 >= vqs.length) {
      setResults(updated)
      setScreen('results')
      let n = 0
      const iv = setInterval(() => { n++; setRevealCount(n); if (n >= updated.length) clearInterval(iv) }, 220)
    } else {
      const next = idx + 1
      indexRef.current = next
      transcriptRef.current = ''
      setTranscript('')
      setTimeLeft(QUESTION_TIME)
      setQEntering(false)
      setTimeout(() => {
        setCurrentIndex(next)
        setQEntering(true)
        startForIndexRef.current(next)
      }, 380)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stops the timer + kicks off the Deepgram transcription pipeline
  const submitAnswer = useCallback(() => {
    if (isSubmittingRef.current) return   // guard against double-fire
    isSubmittingRef.current = true

    // Kill the countdown immediately
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

    setIsRecording(false)
    setIsTranscribing(true)

    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      // No recording available — finalize with empty transcript
      finalizeQuestion('')
      return
    }

    // onstop is set inside startForIndex and handles transcription + finalizeQuestion
    recorder.stop()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizeQuestion])

  const startForIndex = useCallback((idx: number) => {
    audioChunksRef.current = []
    isSubmittingRef.current = false

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream
        const mimeType = getSupportedMimeType()
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data)
        }

        recorder.onstop = async () => {
          // Release mic stream
          stream.getTracks().forEach(t => t.stop())
          streamRef.current = null

          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          let transcriptText = ''
          try {
            const fd = new FormData()
            fd.append('audio', blob, 'recording.webm')
            fd.append('language', languageRef.current)
            const res  = await fetch('/api/transcribe', { method: 'POST', body: fd })
            const data = await res.json()
            transcriptText = data.transcript ?? ''
          } catch (err) {
            console.error('Transcription failed:', err)
          }
          finalizeQuestion(transcriptText)
        }

        recorder.start()
        setIsRecording(true)

        // Start countdown timer
        let t = QUESTION_TIME
        setTimeLeft(t)
        timerRef.current = setInterval(() => {
          t--; setTimeLeft(t)
          if (t <= 0) submitAnswer()
        }, 1000)
      })
      .catch(err => {
        console.error('Mic error:', err)
        setIsRecording(false)
        setIsTranscribing(false)
        isSubmittingRef.current = false
        // Give the user a readable error rather than a silent failure
        const name = (err as DOMException)?.name ?? ''
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setSprintError('No microphone found. Please plug in a mic or check your system audio settings, then try again.')
        } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setSprintError('Microphone access was denied. Allow mic access in your browser settings and try again.')
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setSprintError('Your microphone is in use by another app. Close any other apps using the mic and try again.')
        } else {
          setSprintError(`Could not access microphone: ${(err as Error)?.message ?? err}`)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizeQuestion, submitAnswer])

  // Keep the ref up-to-date so finalizeQuestion can call it without circular dep
  useEffect(() => { startForIndexRef.current = startForIndex }, [startForIndex])

  const startSprint = () => {
    const vqs = validQuestions
    validQsRef.current    = vqs
    answersRef.current    = answers
    indexRef.current      = 0
    resultsRef.current    = []
    transcriptRef.current = ''
    isSubmittingRef.current = false
    setResults([])
    setRevealCount(0)
    setCurrentIndex(0)
    setTranscript('')
    setTimeLeft(QUESTION_TIME)
    setIsTranscribing(false)
    setSprintError(null)
    setQEntering(false)
    setScreen('sprint')
    setTimeout(() => { setQEntering(true); startForIndex(0) }, 280)
  }

  const restart = () => {
    stopAll()
    setScreen('start')
    setCurrentIndex(0)
    setTranscript('')
    setIsTranscribing(false)
    setSprintError(null)
    setResults([])
    setRevealCount(0)
    resultsRef.current = []
    indexRef.current   = 0
  }

  useEffect(() => () => stopAll(), [stopAll])

  // ── Computed for sprint UI
  const sprintQ       = validQsRef.current[currentIndex] ?? ''
  const totalQ        = validQsRef.current.length
  const progressPct   = totalQ > 0 ? (currentIndex / totalQ) * 100 : 0
  const currentLang   = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0]

  // ─────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#080B1A', position: 'relative', overflow: 'hidden' }}>

      {/* ── Aurora background ───────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', width: 700, height: 700,
          borderRadius: '50%', top: '-180px', left: '-180px',
          background: 'radial-gradient(circle, rgba(140,123,255,0.18) 0%, transparent 70%)',
          animation: 'aurora1 18s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 600, height: 600,
          borderRadius: '50%', bottom: '-150px', right: '-120px',
          background: 'radial-gradient(circle, rgba(198,255,77,0.12) 0%, transparent 70%)',
          animation: 'aurora2 24s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500,
          borderRadius: '50%', top: '40%', left: '40%',
          background: 'radial-gradient(circle, rgba(255,77,109,0.08) 0%, transparent 70%)',
          animation: 'aurora3 20s ease-in-out infinite',
        }} />
      </div>

      {/* ── Page content ────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ══════════════════════════════════════════════════
            START SCREEN
        ══════════════════════════════════════════════════ */}
        {screen === 'start' && (
          <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '0 16px', paddingTop: 48, paddingBottom: 60 }}>
            <div style={{ width: '100%', maxWidth: 680 }}>

              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 48, animation: 'floatIn 0.6s ease forwards' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: 'rgba(140,123,255,0.12)', border: '1px solid rgba(140,123,255,0.25)',
                  borderRadius: 40, padding: '6px 18px', marginBottom: 24,
                }}>
                  <span style={{ fontSize: 18 }}>🎤</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#8C7BFF', letterSpacing: '0.04em' }}>VOICE SPRINT</span>
                </div>
                <h1 className="font-display" style={{
                  fontSize: 'clamp(36px, 6vw, 58px)', fontWeight: 800, lineHeight: 1.1,
                  background: 'linear-gradient(135deg, #F0F4FF 0%, #8C7BFF 50%, #C6FF4D 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  marginBottom: 16,
                }}>
                  Speak. Record. Review.
                </h1>
                <p style={{ color: '#8B92B9', fontSize: 17, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
                  Nail your oral exams. Type your questions, tap Start — the app records every answer and shows you exactly what you said.
                </p>
              </div>

              {/* Questions Panel Button + Clear */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, animation: 'floatIn 0.6s 0.1s ease both' }}>
                <button
                  onClick={() => setShowQPanel(p => !p)}
                  className="btn-hover"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                    background: showQPanel ? 'rgba(140,123,255,0.2)' : 'rgba(140,123,255,0.1)',
                    border: `1px solid ${showQPanel ? 'rgba(140,123,255,0.5)' : 'rgba(140,123,255,0.2)'}`,
                    borderRadius: 12, color: '#8C7BFF', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                  <span style={{ fontSize: 16 }}>🧠</span>
                  AI Questions
                </button>
                {validQuestions.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="btn-hover"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
                      background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)',
                      borderRadius: 12, color: '#FF4D6D', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    }}>
                    <span>✕</span> Clear all
                  </button>
                )}
              </div>

              {/* AI Questions Panel */}
              {showQPanel && (
                <div style={{
                  marginBottom: 20,
                  background: 'rgba(15,18,40,0.8)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(140,123,255,0.2)',
                  borderRadius: 20,
                  padding: 24,
                  animation: 'panelSlideIn 0.25s ease forwards',
                }}>
                  <div className="font-display" style={{ fontWeight: 700, fontSize: 15, color: '#8C7BFF', marginBottom: 14 }}>
                    Generate from notes
                  </div>

                  {/* Notes textarea */}
                  <div style={{
                    background: 'rgba(30,35,71,0.6)', borderRadius: 14,
                    border: '1px solid rgba(139,146,185,0.12)', padding: '14px 16px', marginBottom: 14,
                  }}>
                    <textarea
                      className="notes-input"
                      placeholder="Paste your study notes, lecture content, or topics here…"
                      value={notesInput}
                      onChange={e => setNotesInput(e.target.value)}
                    />
                  </div>

                  {/* Count + Generate */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: draftText ? 14 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                      <span style={{ color: '#8B92B9', fontSize: 13, whiteSpace: 'nowrap' }}>Questions:</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {[3, 5, 8, 10].map(n => (
                          <button key={n} onClick={() => { setGenerateCount(n); setCustomCountMode(false) }} style={{
                            padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: !customCountMode && generateCount === n ? '#8C7BFF' : 'rgba(139,146,185,0.1)',
                            color: !customCountMode && generateCount === n ? '#fff' : '#8B92B9',
                            fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                          }}>{n}</button>
                        ))}
                        {/* Custom pill */}
                        <button
                          onClick={() => setCustomCountMode(p => !p)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, border: customCountMode ? 'none' : '1px dashed rgba(139,146,185,0.3)',
                            cursor: 'pointer',
                            background: customCountMode ? '#8C7BFF' : 'transparent',
                            color: customCountMode ? '#fff' : '#8B92B9',
                            fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                          }}
                        >
                          Custom
                        </button>
                        {customCountMode && (
                          <input
                            type="number"
                            min={1} max={15}
                            value={generateCount}
                            onChange={e => {
                              const v = Math.min(15, Math.max(1, Number(e.target.value) || 1))
                              setGenerateCount(v)
                            }}
                            style={{
                              width: 52, padding: '4px 8px', borderRadius: 8,
                              background: 'rgba(140,123,255,0.15)',
                              border: '1px solid rgba(140,123,255,0.4)',
                              color: '#F0F4FF', fontSize: 13, fontWeight: 600,
                              textAlign: 'center', outline: 'none',
                            }}
                            autoFocus
                          />
                        )}
                      </div>
                    </div>
                    <button
                      onClick={generateQuestions}
                      disabled={isGenerating || !notesInput.trim()}
                      className="btn-hover"
                      style={{
                        padding: '10px 20px', borderRadius: 12,
                        background: isGenerating ? 'rgba(140,123,255,0.15)' : 'rgba(140,123,255,0.25)',
                        border: '1px solid rgba(140,123,255,0.4)',
                        color: '#8C7BFF', fontSize: 14, fontWeight: 600, cursor: isGenerating ? 'default' : 'pointer',
                        opacity: (!notesInput.trim() && !isGenerating) ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                      {isGenerating ? (
                        <>
                          <span style={{
                            width: 14, height: 14, borderRadius: '50%',
                            border: '2px solid rgba(140,123,255,0.3)', borderTopColor: '#8C7BFF',
                            animation: 'waveBar 0.8s linear infinite', display: 'inline-block',
                          }} />
                          Generating…
                        </>
                      ) : '🧠 Generate'}
                    </button>
                  </div>

                  {/* Draft textarea */}
                  {draftText && (
                    <div>
                      <div style={{ fontSize: 12, color: '#8B92B9', marginBottom: 8, marginTop: 4 }}>
                        Edit the draft, then insert:
                      </div>
                      <div style={{
                        background: 'rgba(30,35,71,0.6)', borderRadius: 14,
                        border: '1px solid rgba(139,146,185,0.12)', padding: '14px 16px', marginBottom: 12,
                      }}>
                        <textarea
                          className="draft-input"
                          value={draftText}
                          onChange={e => setDraftText(e.target.value)}
                          placeholder="One question per line…"
                        />
                      </div>

                      {/* Generated answers preview */}
                      {hasDefaultAnswers && draftAnswers.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 12, color: '#8B92B9', marginBottom: 6 }}>
                            Generated answers (editable after insert):
                          </div>
                          <div style={{
                            background: 'rgba(30,35,71,0.6)', borderRadius: 14,
                            border: '1px solid rgba(140,123,255,0.15)', padding: '12px 16px',
                            display: 'flex', flexDirection: 'column', gap: 8,
                          }}>
                            {draftAnswers.map((ans, i) => ans && (
                              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#4A5280', minWidth: 20, marginTop: 1 }}>
                                  {(i + 1).toString().padStart(2, '0')}
                                </span>
                                <span style={{ fontSize: 13, color: '#8C7BFF', lineHeight: 1.5 }}>{ans}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={insertDraft}
                        className="btn-hover"
                        style={{
                          width: '100%', padding: '12px', borderRadius: 12,
                          background: 'linear-gradient(135deg, #8C7BFF, #6B5FE4)',
                          border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                        }}>
                        ↓ Insert questions
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Language row */}
              <div style={{ marginBottom: 20, animation: 'floatIn 0.6s 0.15s ease both' }}>
                <div style={{ fontSize: 12, color: '#4A5280', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Answer language
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className="btn-hover"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 16px', borderRadius: 50,
                        background: language === lang.code ? 'rgba(198,255,77,0.15)' : 'rgba(30,35,71,0.5)',
                        border: `1px solid ${language === lang.code ? 'rgba(198,255,77,0.45)' : 'rgba(139,146,185,0.12)'}`,
                        color: language === lang.code ? '#C6FF4D' : '#8B92B9',
                        fontSize: 14, fontWeight: language === lang.code ? 600 : 400,
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}>
                      <span>{lang.flag}</span> {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language check status banner */}
              {langCheck.status !== 'idle' && (
                <div style={{
                  marginBottom: 16,
                  animation: 'floatIn 0.3s ease forwards',
                }}>
                  {langCheck.status === 'checking' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', borderRadius: 12,
                      background: 'rgba(139,146,185,0.07)',
                      border: '1px solid rgba(139,146,185,0.12)',
                    }}>
                      {/* Spinner */}
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: '2px solid rgba(140,123,255,0.25)',
                        borderTopColor: '#8C7BFF',
                        animation: 'spin 0.7s linear infinite',
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 13, color: '#8B92B9' }}>
                        🧠 Checking language match…
                      </span>
                    </div>
                  )}
                  {langCheck.status === 'ok' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', borderRadius: 12,
                      background: 'rgba(198,255,77,0.07)',
                      border: '1px solid rgba(198,255,77,0.2)',
                    }}>
                      <span style={{ fontSize: 16 }}>✅</span>
                      <span style={{ fontSize: 13, color: '#C6FF4D', fontWeight: 500 }}>
                        Questions match your selected language ({langCheck.detectedLanguage})
                      </span>
                    </div>
                  )}
                  {langCheck.status === 'warn' && (
                    <div style={{
                      padding: '14px 16px', borderRadius: 14,
                      background: 'rgba(255,193,7,0.07)',
                      border: '1px solid rgba(255,193,7,0.25)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#FFD60A', marginBottom: 4 }}>
                            Language mismatch detected
                          </div>
                          <div style={{ fontSize: 13, color: '#8B92B9', lineHeight: 1.5 }}>
                            {langCheck.note || `Questions appear to be in ${langCheck.detectedLanguage} but you selected a different language.`}
                          </div>
                        </div>
                        <button
                          onClick={() => setLangCheck({ status: 'idle' })}
                          className="icon-btn"
                          style={{ color: '#4A5280', padding: 4, flexShrink: 0 }}
                          title="Dismiss">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Show Question toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, animation: 'floatIn 0.6s 0.18s ease both' }}>
                {/* Toggle switch — left */}
                <div
                  onClick={() => setShowQuestion(p => !p)}
                  style={{
                    width: 50, height: 28, borderRadius: 50, cursor: 'pointer',
                    background: showQuestion
                      ? 'linear-gradient(135deg, #C6FF4D, #9DDB1A)'
                      : 'rgba(74,82,128,0.4)',
                    border: showQuestion ? 'none' : '1px solid rgba(139,146,185,0.2)',
                    position: 'relative',
                    transition: 'background 0.25s, border 0.25s',
                    flexShrink: 0,
                    boxShadow: showQuestion ? '0 0 12px rgba(198,255,77,0.35)' : 'none',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: 3, left: showQuestion ? 25 : 3,
                    width: 22, height: 22,
                    borderRadius: '50%',
                    background: showQuestion ? '#080B1A' : '#8B92B9',
                    transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1), background 0.25s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }} />
                </div>
                {/* Label — right */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F4FF' }}>Show question during sprint</div>
                  <div style={{ fontSize: 12, color: '#4A5280', marginTop: 2 }}>
                    {showQuestion ? 'Question visible on screen while recording' : 'Question hidden — test your recall'}
                  </div>
                </div>
              </div>

              {/* Default Answers toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, animation: 'floatIn 0.6s 0.2s ease both' }}>
                <div
                  onClick={() => setHasDefaultAnswers(p => !p)}
                  style={{
                    width: 50, height: 28, borderRadius: 50, cursor: 'pointer',
                    background: hasDefaultAnswers
                      ? 'linear-gradient(135deg, #FF4D6D, #D93855)'
                      : 'rgba(74,82,128,0.4)',
                    border: hasDefaultAnswers ? 'none' : '1px solid rgba(139,146,185,0.2)',
                    position: 'relative', transition: 'background 0.25s, border 0.25s', flexShrink: 0,
                    boxShadow: hasDefaultAnswers ? '0 0 12px rgba(255,77,109,0.4)' : 'none',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3,
                    left: hasDefaultAnswers ? 25 : 3,
                    width: 22, height: 22, borderRadius: '50%',
                    background: hasDefaultAnswers ? '#080B1A' : '#8B92B9',
                    transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1), background 0.25s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F4FF' }}>Default answers</div>
                  <div style={{ fontSize: 12, color: '#4A5280', marginTop: 2 }}>
                    {hasDefaultAnswers ? 'Follow the answer words during sprint' : 'Free-form answer — speak anything'}
                  </div>
                </div>
              </div>

              {/* Your Questions label */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, animation: 'floatIn 0.6s 0.2s ease both' }}>
                <div style={{ fontSize: 12, color: '#4A5280', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Your questions
                </div>
                <span style={{ fontSize: 12, color: '#4A5280' }}>
                  {validQuestions.length} / {questions.length} filled
                </span>
              </div>

              {/* Question cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {questions.map((q, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    animation: removingIdx === i
                      ? 'scaleIn 0.24s ease reverse forwards'
                      : 'cardSlideIn 0.25s ease forwards',
                    opacity: removingIdx === i ? 0 : 1,
                    transition: 'opacity 0.24s',
                  }}>
                    <div style={{
                      flex: 1,
                      background: 'rgba(15,18,40,0.7)',
                      backdropFilter: 'blur(12px)',
                      border: `1px solid ${q.trim() ? 'rgba(198,255,77,0.18)' : 'rgba(139,146,185,0.12)'}`,
                      borderRadius: 16,
                      padding: '14px 18px',
                      display: 'flex', gap: 14, alignItems: 'flex-start',
                      transition: 'border-color 0.25s',
                    }}>
                      <span className="font-display" style={{
                        fontSize: 13, fontWeight: 700, color: '#4A5280', minWidth: 22,
                        marginTop: 1, lineHeight: 1.5,
                      }}>
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                      <div style={{ flex: 1 }}>
                        <textarea
                          className="q-input"
                          rows={1}
                          value={q}
                          onChange={e => {
                            updateQuestion(i, e.target.value)
                            const el = e.target as HTMLTextAreaElement
                            el.style.height = 'auto'
                            el.style.height = el.scrollHeight + 'px'
                          }}
                          placeholder={`Question ${i + 1}…`}
                        />
                        {hasDefaultAnswers && (
                          <>
                            <div style={{ height: 1, background: 'rgba(140,123,255,0.15)', margin: '8px 0' }} />
                            <textarea
                              className="a-input"
                              rows={1}
                              value={answers[i] ?? ''}
                              onChange={e => {
                                updateAnswer(i, e.target.value)
                                const el = e.target as HTMLTextAreaElement
                                el.style.height = 'auto'
                                el.style.height = el.scrollHeight + 'px'
                              }}
                              placeholder={`Expected answer ${i + 1}…`}
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {questions.length > 1 && (
                      <button
                        onClick={() => removeQuestion(i)}
                        className="icon-btn"
                        style={{ color: '#4A5280', padding: 10, marginTop: 2 }}
                        title="Remove question">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Answer language check banner */}
              {hasDefaultAnswers && answerLangCheck.status !== 'idle' && (
                <div style={{ marginBottom: 16, animation: 'floatIn 0.3s ease forwards' }}>
                  {answerLangCheck.status === 'checking' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, background: 'rgba(139,146,185,0.07)', border: '1px solid rgba(139,146,185,0.12)' }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(140,123,255,0.25)', borderTopColor: '#8C7BFF', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#8B92B9' }}>🧠 Checking answer language…</span>
                    </div>
                  )}
                  {answerLangCheck.status === 'ok' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, background: 'rgba(198,255,77,0.07)', border: '1px solid rgba(198,255,77,0.2)' }}>
                      <span style={{ fontSize: 16 }}>✅</span>
                      <span style={{ fontSize: 13, color: '#C6FF4D', fontWeight: 500 }}>Answers match selected language ({answerLangCheck.detectedLanguage})</span>
                    </div>
                  )}
                  {answerLangCheck.status === 'warn' && (
                    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,193,7,0.07)', border: '1px solid rgba(255,193,7,0.25)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#FFD60A', marginBottom: 4 }}>Answer language mismatch</div>
                          <div style={{ fontSize: 13, color: '#8B92B9', lineHeight: 1.5 }}>
                            {answerLangCheck.note || `Answers appear to be in ${answerLangCheck.detectedLanguage} but you selected a different language.`}
                          </div>
                        </div>
                        <button onClick={() => setAnswerLangCheck({ status: 'idle' })} className="icon-btn" style={{ color: '#4A5280', padding: 4, flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Add question */}
              <button
                onClick={addQuestion}
                className="btn-hover"
                style={{
                  width: '100%', padding: '13px', borderRadius: 16,
                  background: 'transparent',
                  border: '1.5px dashed rgba(139,146,185,0.2)',
                  color: '#8B92B9', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginBottom: 32,
                  transition: 'border-color 0.2s, color 0.2s',
                  animation: 'floatIn 0.6s 0.25s ease both',
                }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Add question
              </button>

              {/* Start button */}
              <button
                onClick={() => {
                  if (!canStart) return
                  if (langCheck.status === 'warn') {
                    setShowMismatchModal(true)
                  } else {
                    startSprint()
                  }
                }}
                className="btn-hover"
                style={{
                  width: '100%', padding: '18px',
                  borderRadius: 20,
                  background: canStart
                    ? 'linear-gradient(135deg, #C6FF4D 0%, #9DDB1A 100%)'
                    : 'rgba(198,255,77,0.08)',
                  border: canStart ? 'none' : '1px solid rgba(198,255,77,0.15)',
                  color: canStart ? '#080B1A' : 'rgba(198,255,77,0.3)',
                  fontSize: 17, fontWeight: 800, cursor: canStart ? 'pointer' : 'default',
                  animation: canStart ? 'glowPulse 2.5s ease-in-out infinite, floatIn 0.6s 0.3s ease both' : 'floatIn 0.6s 0.3s ease both',
                  transition: 'all 0.3s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>
                {canStart
                  ? <><span style={{ fontSize: 20 }}>🎙️</span> Start Sprint</>
                  : 'Add a question to start'}
              </button>

              <p style={{ textAlign: 'center', color: '#4A5280', fontSize: 12, marginTop: 20, animation: 'floatIn 0.6s 0.35s ease both' }}>
                Works best in Chrome or Edge · 15 seconds per question
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            SPRINT SCREEN
        ══════════════════════════════════════════════════ */}
        {screen === 'sprint' && (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>

            {/* Progress bar */}
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: 'rgba(139,146,185,0.1)', zIndex: 10 }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #8C7BFF, #C6FF4D)',
                transition: 'width 0.4s ease',
                borderRadius: '0 2px 2px 0',
              }} />
            </div>

            {/* Top info bar */}
            <div style={{
              position: 'fixed', top: 16, left: 0, right: 0, zIndex: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0 24px',
            }}>
              <div style={{
                background: 'rgba(15,18,40,0.8)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(139,146,185,0.12)',
                borderRadius: 50, padding: '7px 16px',
                fontSize: 13, fontWeight: 600, color: '#8B92B9',
              }}>
                {currentLang.flag} {currentLang.label}
              </div>
              <div className="font-display" style={{
                background: 'rgba(15,18,40,0.8)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(139,146,185,0.12)',
                borderRadius: 50, padding: '7px 16px',
                fontSize: 13, fontWeight: 700, color: '#F0F4FF',
              }}>
                {currentIndex + 1} <span style={{ color: '#4A5280' }}>/ {totalQ}</span>
              </div>
            </div>

            <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>

              {/* Mic error card */}
              {sprintError && (
                <div style={{
                  width: '100%',
                  background: 'rgba(255,77,109,0.08)',
                  border: '1px solid rgba(255,77,109,0.3)',
                  borderRadius: 20, padding: '24px 28px',
                  animation: 'floatIn 0.3s ease forwards',
                }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 28, flexShrink: 0 }}>🎤</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#FF4D6D', marginBottom: 8 }}>Microphone error</div>
                      <div style={{ fontSize: 14, color: '#8B92B9', lineHeight: 1.55, marginBottom: 16 }}>{sprintError}</div>
                      <button
                        onClick={() => { stopAll(); setScreen('start'); setSprintError(null) }}
                        className="btn-hover"
                        style={{
                          padding: '10px 20px', borderRadius: 12,
                          background: 'rgba(255,77,109,0.15)',
                          border: '1px solid rgba(255,77,109,0.3)',
                          color: '#FF4D6D', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}
                      >
                        ← Go back
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Question card */}
              <div style={{
                width: '100%',
                background: 'rgba(15,18,40,0.75)',
                backdropFilter: 'blur(24px)',
                border: `1px solid ${showQuestion ? 'rgba(139,146,185,0.15)' : 'rgba(140,123,255,0.18)'}`,
                borderRadius: 28,
                padding: '36px 36px',
                textAlign: 'center',
                animation: qEntering ? 'slideInRight 0.35s ease forwards' : 'none',
                minHeight: 140,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* Accent glow */}
                <div style={{
                  position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
                  width: 200, height: 80,
                  background: `radial-gradient(ellipse, ${showQuestion ? 'rgba(140,123,255,0.15)' : 'rgba(198,255,77,0.1)'} 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                {showQuestion ? (
                  <p className="font-display" style={{
                    fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 700, lineHeight: 1.4,
                    color: '#F0F4FF', position: 'relative', zIndex: 1,
                  }}>
                    {sprintQ}
                  </p>
                ) : (
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 32 }}>🤫</div>
                    <p className="font-display" style={{ fontSize: 15, fontWeight: 600, color: '#4A5280', letterSpacing: '0.02em' }}>
                      Question hidden — speak from memory
                    </p>
                    <div style={{
                      fontSize: 12, color: '#8B92B9', background: 'rgba(140,123,255,0.12)',
                      border: '1px solid rgba(140,123,255,0.2)', borderRadius: 8,
                      padding: '4px 12px', marginTop: 2,
                    }}>
                      Q{currentIndex + 1} of {totalQ}
                    </div>
                  </div>
                )}
              </div>

              {/* Karaoke word-follow (Default Answers mode) */}
              {hasDefaultAnswers && (() => {
                const expectedWords = (answersRef.current[currentIndex] ?? '').trim().split(/\s+/).filter(Boolean)
                if (!expectedWords.length) return null
                const spokenWords = transcript.trim().split(/\s+/).filter(Boolean)
                const matched = computeMatchedWords(expectedWords, spokenWords)
                const allDone = matched.every(Boolean)
                return (
                  <div style={{
                    width: '100%',
                    background: 'rgba(15,18,40,0.6)',
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${allDone ? 'rgba(198,255,77,0.25)' : 'rgba(140,123,255,0.18)'}`,
                    borderRadius: 20,
                    padding: '20px 24px',
                    transition: 'border-color 0.4s',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#4A5280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                      {allDone ? '✅ Complete!' : 'Say these words'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 10px', justifyContent: 'center' }}>
                      {expectedWords.map((word, wi) => (
                        <span key={wi} style={{
                          fontSize: 'clamp(16px, 3.5vw, 22px)',
                          fontWeight: 700,
                          fontFamily: "'Space Grotesk', sans-serif",
                          color: matched[wi] ? '#1CB0F6' : '#2A2E50',
                          background: matched[wi] ? 'rgba(28,176,246,0.15)' : 'rgba(139,146,185,0.06)',
                          border: `1px solid ${matched[wi] ? 'rgba(28,176,246,0.3)' : 'rgba(139,146,185,0.1)'}`,
                          borderRadius: 10,
                          padding: '4px 12px',
                          transition: 'color 0.35s, background 0.35s, border-color 0.35s',
                          letterSpacing: '0.01em',
                        }}>{word}</span>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Timer + Mic */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

                <CircularTimer timeLeft={timeLeft} total={QUESTION_TIME} />

                {/* Mic button with pulse rings */}
                <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isRecording && [1,2,3].map(ring => (
                    <div key={ring} style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: `2px solid rgba(198,255,77,0.5)`,
                      animation: `pulseRing 2s ${ring * 0.55}s ease-out infinite`,
                    }} />
                  ))}
                  <button
                    onClick={submitAnswer}
                    style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: isTranscribing
                        ? 'rgba(255,193,7,0.15)'
                        : isRecording
                          ? 'linear-gradient(135deg, #C6FF4D 0%, #8BDB00 100%)'
                          : 'rgba(30,35,71,0.8)',
                      border: isTranscribing
                        ? '2px solid rgba(255,193,7,0.4)'
                        : isRecording ? 'none' : '2px solid rgba(139,146,185,0.2)',
                      cursor: isTranscribing ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isRecording ? '0 0 32px rgba(198,255,77,0.45)' : 'none',
                      transition: 'all 0.3s',
                      zIndex: 1, position: 'relative',
                    }}
                    title={isTranscribing ? 'Transcribing…' : 'Submit answer early'}>
                    {isTranscribing ? (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid rgba(255,193,7,0.3)', borderTopColor: '#FFD60A', animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Z" fill={isRecording ? '#080B1A' : '#4A5280'}/>
                        <path d="M19 10a7 7 0 0 1-14 0M12 19v3M9 22h6" stroke={isRecording ? '#080B1A' : '#4A5280'} strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                </div>

                <p style={{ color: isTranscribing ? '#FFD60A' : '#4A5280', fontSize: 13, textAlign: 'center', transition: 'color 0.3s' }}>
                  {isTranscribing ? '⏳ Transcribing…' : isRecording ? 'Recording… tap mic to submit early' : 'Starting…'}
                </p>
              </div>

              {/* Waveform / transcribing indicator */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                {isTranscribing ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 20px', borderRadius: 14,
                    background: 'rgba(255,193,7,0.08)',
                    border: '1px solid rgba(255,193,7,0.2)',
                    animation: 'floatIn 0.3s ease forwards',
                  }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,193,7,0.3)', borderTopColor: '#FFD60A', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#FFD60A', fontWeight: 500 }}>Sending to Deepgram…</span>
                  </div>
                ) : (
                  <Waveform active={isRecording} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            RESULTS SCREEN
        ══════════════════════════════════════════════════ */}
        {screen === 'results' && (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 16px', position: 'relative' }}>

            {/* Confetti */}
            <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 20 }}>
              {Array.from({ length: 28 }).map((_, i) => <ConfettiPiece key={i} i={i} />)}
            </div>

            <div style={{ width: '100%', maxWidth: 640, position: 'relative', zIndex: 1 }}>

              {/* Celebration header */}
              <div style={{ textAlign: 'center', marginBottom: 48, animation: 'scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
                {(() => {
                  const answered = results.filter(r => r.transcript !== '(no answer recorded)').length
                  const total    = results.length
                  const pct      = total > 0 ? answered / total : 0
                  const emoji    = pct === 1 ? '🏆' : pct >= 0.5 ? '🎯' : '💪'
                  const title    = pct === 1 ? 'Sprint Complete!' : pct >= 0.5 ? 'Good effort!' : 'Keep practising!'
                  return (
                    <>
                      <div style={{ fontSize: 72, marginBottom: 16, display: 'inline-block', animation: 'trophyFloat 3s ease-in-out infinite' }}>{emoji}</div>
                      <h1 className="font-display" style={{
                        fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1,
                        background: 'linear-gradient(135deg, #F0F4FF 0%, #C6FF4D 60%, #8C7BFF 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        marginBottom: 12,
                      }}>{title}</h1>
                      <p style={{ color: '#8B92B9', fontSize: 16 }}>
                        <span className="font-display" style={{ fontSize: 28, fontWeight: 800, color: '#F0F4FF' }}>
                          {answered}/{total}
                        </span>
                        {' '}questions answered
                      </p>
                    </>
                  )
                })()}

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Questions', value: results.length, icon: '❓' },
                    { label: 'Answered', value: results.filter(r => r.transcript !== '(no answer recorded)').length, icon: '✅' },
                    { label: 'Skipped', value: results.filter(r => r.transcript === '(no answer recorded)').length, icon: '⏭️' },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: 'rgba(15,18,40,0.7)', backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(139,146,185,0.12)',
                      borderRadius: 16, padding: '14px 22px', minWidth: 100,
                      animation: 'badgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                    }}>
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{stat.icon}</div>
                      <div className="font-display" style={{ fontSize: 24, fontWeight: 800, color: '#F0F4FF' }}>{stat.value}</div>
                      <div style={{ fontSize: 12, color: '#4A5280', fontWeight: 500 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Result cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
                {results.map((result, i) => (
                  <div key={i} style={{
                    background: 'rgba(15,18,40,0.75)',
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${result.transcript === '(no answer recorded)' ? 'rgba(255,77,109,0.2)' : 'rgba(139,146,185,0.12)'}`,
                    borderRadius: 22,
                    overflow: 'hidden',
                    opacity: i < revealCount ? 1 : 0,
                    animationName: i < revealCount ? 'resultIn' : 'none',
                    animationDuration: '0.4s',
                    animationFillMode: 'both',
                    animationTimingFunction: 'ease',
                    animationDelay: `${i * 0.05}s`,
                  }}>
                    {/* Question row */}
                    <div style={{
                      padding: '18px 24px 14px',
                      borderBottom: '1px solid rgba(139,146,185,0.08)',
                      display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: 'rgba(140,123,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: '#8C7BFF',
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>
                        {i + 1}
                      </div>
                      <p style={{ color: '#8B92B9', fontSize: 14, lineHeight: 1.5, fontWeight: 500 }}>
                        {result.question}
                      </p>
                    </div>
                    {/* Transcript row */}
                    <div style={{ padding: '14px 24px 18px', paddingLeft: 66 }}>
                      {result.transcript === '(no answer recorded)' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF4D6D', fontSize: 13 }}>
                          <span>⏭️</span> No answer recorded
                        </div>
                      ) : (
                        <p style={{ color: '#F0F4FF', fontSize: 15, lineHeight: 1.6 }}>
                          {result.transcript}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                {/* Reattempt — same questions */}
                <button
                  onClick={() => {
                    stopAll()
                    const vqs = validQsRef.current  // already set from the sprint
                    indexRef.current      = 0
                    resultsRef.current    = []
                    transcriptRef.current = ''
                    isSubmittingRef.current = false
                    setResults([])
                    setRevealCount(0)
                    setCurrentIndex(0)
                    setTranscript('')
                    setTimeLeft(QUESTION_TIME)
                    setIsTranscribing(false)
                    setSprintError(null)
                    setQEntering(false)
                    setScreen('sprint')
                    setTimeout(() => { setQEntering(true); startForIndex(0) }, 280)
                  }}
                  className="btn-hover"
                  style={{
                    flex: 1, padding: '16px',
                    borderRadius: 18,
                    background: 'linear-gradient(135deg, #FF4D6D 0%, #D93855 100%)',
                    border: 'none', color: '#fff',
                    fontSize: 16, fontWeight: 800, cursor: 'pointer',
                    fontFamily: "'Space Grotesk', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}>
                  <span>🔁</span> Reattempt
                </button>
                <button
                  onClick={restart}
                  className="btn-hover"
                  style={{
                    flex: 1, padding: '16px',
                    borderRadius: 18,
                    background: 'linear-gradient(135deg, #C6FF4D 0%, #9DDB1A 100%)',
                    border: 'none', color: '#080B1A',
                    fontSize: 16, fontWeight: 800, cursor: 'pointer',
                    fontFamily: "'Space Grotesk', sans-serif",
                    animation: 'glowPulse 2.5s ease-in-out infinite',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}>
                  <span>🔄</span> New Sprint
                </button>
              </div>

              <p style={{ textAlign: 'center', color: '#4A5280', fontSize: 12, marginTop: 20 }}>
                Refresh or start a new sprint · answers are not saved
              </p>
            </div>
          </div>
        )}

      {/* ── Language Mismatch Modal ───────────────────────────────────── */}
      {showMismatchModal && (
        <div
          onClick={() => setShowMismatchModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(8,11,26,0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
            animation: 'floatIn 0.2s ease forwards',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440,
              background: '#0F1228',
              border: '1px solid rgba(255,193,7,0.25)',
              borderRadius: 28, overflow: 'hidden',
              animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '26px 28px 20px',
              borderBottom: '1px solid rgba(139,146,185,0.08)',
              display: 'flex', alignItems: 'flex-start', gap: 14,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                background: 'rgba(255,193,7,0.12)',
                border: '1px solid rgba(255,193,7,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>⚠️</div>
              <div>
                <div className="font-display" style={{ fontSize: 18, fontWeight: 700, color: '#F0F4FF', marginBottom: 6 }}>
                  Language mismatch detected
                </div>
                <div style={{ fontSize: 13, color: '#8B92B9', lineHeight: 1.55 }}>
                  {langCheck.note
                    ? langCheck.note
                    : `Your questions appear to be in ${langCheck.detectedLanguage ?? 'a different language'}, but speech recognition is set to ${LANGUAGES.find(l => l.code === language)?.label ?? language}. This may affect transcription accuracy.`}
                </div>
              </div>
            </div>

            {/* Detected vs Selected */}
            <div style={{ padding: '18px 28px', display: 'flex', gap: 12 }}>
              <div style={{
                flex: 1, borderRadius: 14, padding: '14px 16px',
                background: 'rgba(255,77,109,0.07)',
                border: '1px solid rgba(255,77,109,0.18)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#FF4D6D', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Detected in questions</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#F0F4FF' }}>{langCheck.detectedLanguage ?? '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', color: '#4A5280', fontSize: 20, fontWeight: 300 }}>→</div>
              <div style={{
                flex: 1, borderRadius: 14, padding: '14px 16px',
                background: 'rgba(198,255,77,0.07)',
                border: '1px solid rgba(198,255,77,0.18)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#C6FF4D', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Recognition set to</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#F0F4FF' }}>
                  {LANGUAGES.find(l => l.code === language)?.flag} {LANGUAGES.find(l => l.code === language)?.label}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '4px 28px 26px', display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowMismatchModal(false)}
                className="btn-hover"
                style={{
                  flex: 1, padding: '13px',
                  borderRadius: 14,
                  background: 'rgba(139,146,185,0.08)',
                  border: '1px solid rgba(139,146,185,0.15)',
                  color: '#8B92B9', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Go back
              </button>
              <button
                onClick={() => { setShowMismatchModal(false); startSprint() }}
                className="btn-hover"
                style={{
                  flex: 1, padding: '13px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #FF4D6D 0%, #CC2244 100%)',
                  border: 'none',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Space Grotesk', sans-serif",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <span>🎙️</span> Override & Start
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
