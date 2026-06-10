import { useState, useEffect, useRef, useMemo } from 'react'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'
import { matchScales } from './utils/musicTheory'
import { PitchDisplay } from './components/PitchDisplay'
import { SolfegeRuler } from './components/SolfegeRuler'
import { AudioVisualizer } from './components/AudioVisualizer'
import { HarmonicDisplay } from './components/HarmonicDisplay'
import { ScaleAnalyzer } from './components/ScaleAnalyzer'
import { IntervalTrainer } from './components/IntervalTrainer'
import { AbsolutePitchTrainer } from './components/AbsolutePitchTrainer'
import { RecordingTab } from './components/RecordingTab'
import { KaraokePractice } from './components/KaraokePractice'
import './App.css'

type Tab = 'analysis' | 'absolute' | 'relative' | 'scale' | 'recording' | 'karaoke'

const TABS: { id: Tab; label: string; labelJP: string }[] = [
  { id: 'analysis',  label: 'Analysis',       labelJP: '分析'    },
  { id: 'absolute',  label: 'Absolute Pitch', labelJP: '絶対音感'  },
  { id: 'relative',  label: 'Relative Pitch', labelJP: '相対音感'  },
  { id: 'scale',     label: 'Scale',          labelJP: '音階'    },
  { id: 'recording', label: 'Recording',      labelJP: '録音分析'  },
  { id: 'karaoke',   label: 'Karaoke',        labelJP: '🎤 採点'  },
]

const MAX_RECENT = 30

export default function App() {
  const { state, getAnalyser, start, stop } = useAudioAnalyzer()
  const [activeTab, setActiveTab] = useState<Tab>('analysis')
  const [recentNoteIndices, setRecentNoteIndices] = useState<number[]>([])
  const lastNoteRef = useRef<number | null>(null)

  useEffect(() => {
    if (state.noteInfo) {
      const idx = state.noteInfo.noteIndex
      if (idx !== lastNoteRef.current) {
        lastNoteRef.current = idx
        setRecentNoteIndices(prev => [...prev, idx].slice(-MAX_RECENT))
      }
    }
  }, [state.noteInfo?.noteIndex])

  // Top scale match — drives movable-do display everywhere
  const topScaleMatch = useMemo(
    () => matchScales(recentNoteIndices)[0] ?? null,
    [recentNoteIndices]
  )

  const clearHistory = () => { setRecentNoteIndices([]); lastNoteRef.current = null }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-title">
          <span className="header-icon">♬</span>
          <h1>音感トレーニング</h1>
          <span className="header-sub">Real-time Audio Analysis</span>
        </div>
        <button
          className={`mic-btn ${state.isListening ? 'active' : ''}`}
          onClick={state.isListening ? stop : start}
        >
          {state.isListening ? '⏹ 停止' : '🎤 開始'}
        </button>
        {state.error && <div className="error-msg">⚠ {state.error}</div>}
      </header>

      {/* Always-visible pitch strip */}
      <div className="pitch-strip">
        <PitchDisplay
          noteInfo={state.noteInfo}
          frequency={state.frequency}
          volume={state.volume}
          scaleMatch={topScaleMatch}
        />
      </div>

      {/* Always-visible ドレミ ruler */}
      <div className="solfege-strip">
        <SolfegeRuler
          currentNoteIndex={state.noteInfo?.noteIndex ?? null}
          scaleMatch={topScaleMatch}
        />
      </div>

      {/* Tabs */}
      <nav className="tab-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="tab-jp">{t.labelJP}</span>
            <span className="tab-en">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <main className="tab-content">
        {activeTab === 'analysis' && (
          <div className="tab-pane">
            <section className="card">
              <AudioVisualizer analyserNode={getAnalyser()} frequency={state.frequency} />
            </section>
            <section className="card">
              <div className="card-title">共鳴・倍音分析 Resonance &amp; Harmonics</div>
              <HarmonicDisplay resonanceData={state.resonanceData} frequency={state.frequency} />
            </section>
          </div>
        )}

        {activeTab === 'absolute' && (
          <div className="tab-pane">
            <section className="card">
              <div className="card-title">絶対音感トレーニング Absolute Pitch</div>
              <AbsolutePitchTrainer currentNote={state.noteInfo} />
            </section>
          </div>
        )}

        {activeTab === 'relative' && (
          <div className="tab-pane">
            <section className="card">
              <div className="card-title">相対音感トレーニング Relative Pitch / Intervals</div>
              <IntervalTrainer currentNote={state.noteInfo} />
            </section>
          </div>
        )}

        {activeTab === 'scale' && (
          <div className="tab-pane">
            <section className="card">
              <div className="card-title">音階トレーニング Scale Analysis</div>
              <ScaleAnalyzer
                noteInfo={state.noteInfo}
                recentNoteIndices={recentNoteIndices}
              />
              {recentNoteIndices.length > 0 && (
                <button className="clear-btn" onClick={clearHistory}>履歴クリア</button>
              )}
            </section>
          </div>
        )}

        {activeTab === 'recording' && (
          <div className="tab-pane">
            <section className="card">
              <div className="card-title">録音・分析 Recording &amp; Analysis</div>
              <RecordingTab />
            </section>
          </div>
        )}

        {activeTab === 'karaoke' && (
          <div className="tab-pane">
            <section className="card">
              <div className="card-title">カラオケ採点 Karaoke Scoring</div>
              <KaraokePractice />
            </section>
          </div>
        )}
      </main>

      {!state.isListening && (
        <div className="start-overlay">
          <div className="start-card">
            <div className="start-icon">🎙</div>
            <h2>音感トレーニングへようこそ</h2>
            <ul className="feature-list">
              <li>🎵 <strong>ドレミ表示</strong> — 固定ド・移動ドの両方をリアルタイム表示</li>
              <li>🎯 <strong>絶対音感</strong> — 音名・周波数・セント偏差</li>
              <li>↕ <strong>相対音感</strong> — 音程・インターバルの練習</li>
              <li>🎹 <strong>音階</strong> — スケール自動判定・ピアノ鍵盤</li>
              <li>✨ <strong>共鳴分析</strong> — 倍音・響きの美しさを可視化</li>
            </ul>
            <button className="start-btn" onClick={start}>
              🎤 マイクを起動して始める
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
