/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /**
   * MSG91 OTP widget. Both are public by design - the browser cannot run the
   * widget without them. The account AUTH KEY is a different value and must
   * never appear here: everything named VITE_* is inlined into the bundle.
   */
  readonly VITE_MSG91_WIDGET_ID?: string
  readonly VITE_MSG91_TOKEN_AUTH?: string
  /** Digits the widget sends, from its dashboard setting. Defaults to 6. */
  readonly VITE_MSG91_OTP_LENGTH?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Web Speech API. Chrome on Android exposes it as webkitSpeechRecognition and
 * TypeScript's DOM lib does not declare it, so we declare the slice we use.
 * This is what makes voice typing possible for a seller who cannot type
 * Devanagari on a phone keyboard.
 */
interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>
  resultIndex: number
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: Event & { error?: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
declare const SpeechRecognition: { new (): SpeechRecognitionLike } | undefined
interface Window {
  SpeechRecognition?: { new (): SpeechRecognitionLike }
  webkitSpeechRecognition?: { new (): SpeechRecognitionLike }
}
