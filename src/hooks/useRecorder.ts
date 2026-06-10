import { useState, useRef, useCallback } from 'react'
import { detectPitch } from '../utils/pitchDetection'
import { frequencyToNote, NoteInfo } from '../utils/musicTheory'

export interface PitchSample {
  time: number            // seconds from recording start
  frequency: number | null
  noteInfo: NoteInfo | null
}

export interface Recording {
  id: string
  blob: Blob
  url: string
  duration: number        // seconds
  samples: PitchSample[]
}

interface RecorderState {
  isRecording: boolean
  elapsed: number         // ms since recording started
  recordings: Recording[]
  error: string | null
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    elapsed: 0,
    recordings: [],
    error: null,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const analyserRef      = useRef<AnalyserNode | null>(null)
  const streamRef        = useRef<MediaStream | null>(null)
  const samplesRef       = useRef<PitchSample[]>([])
  const startTimeRef     = useRef<number>(0)
  const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.5
      analyserRef.current = analyser
      audioCtx.createMediaStreamSource(stream).connect(analyser)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      samplesRef.current = []
      startTimeRef.current = Date.now()

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(200)

      // Pitch detection at ~20fps
      const timeBuf = new Float32Array(4096)
      pitchIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || !audioCtxRef.current) return
        analyserRef.current.getFloatTimeDomainData(timeBuf)
        const freq = detectPitch(timeBuf, audioCtxRef.current.sampleRate)
        samplesRef.current.push({
          time: (Date.now() - startTimeRef.current) / 1000,
          frequency: freq,
          noteInfo: freq ? frequencyToNote(freq) : null,
        })
      }, 50)

      timerIntervalRef.current = setInterval(() => {
        setState(prev => ({ ...prev, elapsed: Date.now() - startTimeRef.current }))
      }, 100)

      setState(prev => ({ ...prev, isRecording: true, elapsed: 0, error: null }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'マイクへのアクセスが拒否されました'
      setState(prev => ({ ...prev, error: msg }))
    }
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    if (pitchIntervalRef.current) clearInterval(pitchIntervalRef.current)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)

    const duration = (Date.now() - startTimeRef.current) / 1000
    const samples  = [...samplesRef.current]

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type ?? 'audio/webm' })
      const recording: Recording = {
        id: Date.now().toString(),
        blob,
        url: URL.createObjectURL(blob),
        duration,
        samples,
      }
      setState(prev => ({
        isRecording: false,
        elapsed: 0,
        error: null,
        recordings: [recording, ...prev.recordings],
      }))
    }

    recorder.stop()
    audioCtxRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())
    analyserRef.current = null
  }, [])

  const deleteRecording = useCallback((id: string) => {
    setState(prev => {
      const rec = prev.recordings.find(r => r.id === id)
      if (rec) URL.revokeObjectURL(rec.url)
      return { ...prev, recordings: prev.recordings.filter(r => r.id !== id) }
    })
  }, [])

  return { state, startRecording, stopRecording, deleteRecording }
}
