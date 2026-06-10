import { useState, useRef, useCallback } from 'react'
import { NoteInfo, NOTE_NAMES_EN, NOTE_NAMES_JP, midiToFrequency } from '../utils/musicTheory'
import { PianoKeyboard } from './PianoKeyboard'

interface Props {
  currentNote: NoteInfo | null
}

type Mode = 'listen' | 'quiz'
type QuizState = 'waiting' | 'answered'

function randomMidi(min = 48, max = 72): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function AbsolutePitchTrainer({ currentNote }: Props) {
  const [mode, setMode] = useState<Mode>('listen')
  const [quizMidi, setQuizMidi] = useState<number | null>(null)
  const [quizState, setQuizState] = useState<QuizState>('waiting')
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const audioCtxRef = useRef<AudioContext | null>(null)

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    return audioCtxRef.current
  }, [])

  const playMidi = useCallback((midi: number) => {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = midiToFrequency(midi)
    gain.gain.setValueAtTime(0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 1.5)
  }, [getCtx])

  const newQuestion = useCallback(() => {
    const midi = randomMidi()
    setQuizMidi(midi)
    setQuizState('waiting')
    setSelectedAnswer(null)
    setTimeout(() => playMidi(midi), 100)
  }, [playMidi])

  const handleAnswer = useCallback((noteIdx: number) => {
    if (quizState === 'answered' || quizMidi === null) return
    const correctIdx = ((quizMidi % 12) + 12) % 12
    const isCorrect = noteIdx === correctIdx
    setSelectedAnswer(noteIdx)
    setQuizState('answered')
    setScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }))
  }, [quizState, quizMidi])

  const correctNoteIdx = quizMidi !== null ? ((quizMidi % 12) + 12) % 12 : null

  // For listen mode: show note history
  const activeNoteIndex = currentNote?.noteIndex ?? null

  if (mode === 'listen') {
    return (
      <div className="apt-trainer">
        <div className="apt-mode-btns">
          <button className="apt-mode-btn active">聴き取りモード</button>
          <button className="apt-mode-btn" onClick={() => setMode('quiz')}>クイズモード</button>
        </div>
        <div className="apt-desc">マイクに向かって音を出すと、リアルタイムで音名を表示します。</div>

        <PianoKeyboard
          activeNoteIndex={activeNoteIndex}
          recentNoteIndices={[]}
          startOctave={3}
          numOctaves={2}
        />

        {currentNote ? (
          <div className="apt-note-big">
            <div className="apt-note-jp">{currentNote.noteJP}</div>
            <div className="apt-note-en">{currentNote.note}{currentNote.octave}</div>
            <div className="apt-note-freq">{currentNote.frequency.toFixed(2)} Hz</div>
            <div className="apt-note-midi">MIDI: {currentNote.midiNumber}</div>
          </div>
        ) : (
          <div className="apt-hint">音を出してください</div>
        )}

        {/* Note name reference */}
        <div className="apt-ref-grid">
          {NOTE_NAMES_EN.map((n, i) => (
            <div key={i} className={`apt-ref-cell ${activeNoteIndex === i ? 'active' : ''}`}>
              <div className="apt-ref-en">{n}</div>
              <div className="apt-ref-jp">{NOTE_NAMES_JP[i]}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Quiz mode
  return (
    <div className="apt-trainer">
      <div className="apt-mode-btns">
        <button className="apt-mode-btn" onClick={() => setMode('listen')}>聴き取りモード</button>
        <button className="apt-mode-btn active">クイズモード</button>
      </div>

      <div className="apt-score">
        正解: {score.correct} / {score.total}
        {score.total > 0 && <span> ({Math.round(score.correct / score.total * 100)}%)</span>}
      </div>

      {quizMidi === null ? (
        <div className="apt-start">
          <button className="apt-start-btn" onClick={newQuestion}>クイズ開始</button>
        </div>
      ) : (
        <>
          <div className="apt-quiz-prompt">
            <span>音が鳴ります。何の音でしょう？</span>
            <button className="replay-btn" onClick={() => playMidi(quizMidi)}>▶ もう一度</button>
          </div>

          {/* Answer buttons */}
          <div className="apt-answer-grid">
            {NOTE_NAMES_EN.map((n, i) => {
              let btnClass = 'apt-answer-btn'
              if (quizState === 'answered') {
                if (i === correctNoteIdx) btnClass += ' correct'
                else if (i === selectedAnswer) btnClass += ' wrong'
              }
              return (
                <button
                  key={i}
                  className={btnClass}
                  onClick={() => handleAnswer(i)}
                  disabled={quizState === 'answered'}
                >
                  <span className="aa-en">{n}</span>
                  <span className="aa-jp">{NOTE_NAMES_JP[i]}</span>
                </button>
              )
            })}
          </div>

          {quizState === 'answered' && (
            <div className={`apt-result ${selectedAnswer === correctNoteIdx ? 'correct' : 'wrong'}`}>
              {selectedAnswer === correctNoteIdx
                ? `✓ 正解！${NOTE_NAMES_EN[correctNoteIdx!]} (${NOTE_NAMES_JP[correctNoteIdx!]})`
                : `✗ 不正解。正解は ${NOTE_NAMES_EN[correctNoteIdx!]} (${NOTE_NAMES_JP[correctNoteIdx!]})`
              }
              <button className="apt-next-btn" onClick={newQuestion}>次の問題 →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
