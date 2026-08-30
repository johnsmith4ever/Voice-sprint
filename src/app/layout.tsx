import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Voice Sprint — Oral Exam Practice',
  description: 'Practice your oral exams with AI-powered question sets and speech recognition. Record your answers, get instant transcripts.',
  keywords: 'oral exam, speech practice, language learning, interview prep',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
