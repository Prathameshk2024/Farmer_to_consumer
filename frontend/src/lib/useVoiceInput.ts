import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * VOICE TYPING
 * ============
 * A seller who can speak Marathi fluently may still not be able to type it -
 * the Devanagari keyboard is a real barrier, and for a first-time smartphone
 * user it is often the point where she gives up on the form. So anywhere she
 * has to enter free text, she can press a mic and say it instead.
 *
 * Uses the browser's Web Speech API, which Chrome on Android supports natively.
 * It is not available everywhere - iOS Safari does not have it - so callers
 * must check `supported` and keep the keyboard as the fallback, never hide it.
 *
 * Inside the Android APK it works because the React Native WebView wrapper
 * declares RECORD_AUDIO (its app.json); without that, onerror fires with
 * 'not-allowed'.
 */

export type VoiceError = 'denied' | 'no-speech' | 'network' | 'other' | null

interface UseVoiceInput {
  supported: boolean
  listening: boolean
  error: VoiceError
  /** Live text while she is still speaking, so she can see it working. */
  interim: string
  start: () => void
  stop: () => void
  toggle: () => void
}

export function useVoiceInput(
  onResult: (text: string) => void,
  opts: { lang?: string; continuous?: boolean } = {},
): UseVoiceInput {
  const { lang = 'mr-IN', continuous = false } = opts

  const Ctor =
    typeof window !== 'undefined'
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined
  const supported = Boolean(Ctor)

  const [listening, setListening] = useState(false)
  const [error, setError] = useState<VoiceError>(null)
  const [interim, setInterim] = useState('')

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  // Keep the latest callback without re-creating the recogniser on every render.
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    if (!Ctor) return
    // Restarting while one is live throws InvalidStateError in Chrome.
    recRef.current?.abort()

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = continuous
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setError(null)
      setListening(true)
    }

    rec.onresult = (e) => {
      let finalText = ''
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (!r) continue
        if (r.isFinal) finalText += r[0].transcript
        else partial += r[0].transcript
      }
      setInterim(partial)
      if (finalText.trim()) {
        onResultRef.current(finalText.trim())
        setInterim('')
      }
    }

    rec.onerror = (e) => {
      const code = (e as { error?: string }).error
      setError(
        code === 'not-allowed' || code === 'service-not-allowed'
          ? 'denied'
          : code === 'no-speech'
            ? 'no-speech'
            : code === 'network'
              ? 'network'
              : 'other',
      )
      setListening(false)
    }

    rec.onend = () => {
      setListening(false)
      setInterim('')
    }

    recRef.current = rec
    try {
      rec.start()
    } catch {
      setError('other')
      setListening(false)
    }
  }, [Ctor, lang, continuous])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // Never leave the microphone open when the screen unmounts.
  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, error, interim, start, stop, toggle }
}
