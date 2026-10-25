// Minimal Web Speech types: TS's DOM lib lacks the webkit-prefixed constructor Chrome ships.
export type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous?: boolean;
  onresult: ((e: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; abort(): void;
};
type RecognitionCtor = new () => Recognition;
export const recognitionCtor = () =>
  typeof window === "undefined" ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);
