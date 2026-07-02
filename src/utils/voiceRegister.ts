import { ResonanceData } from './resonanceAnalysis'

export type VoiceRegister = 'none' | 'chest' | 'mix' | 'falsetto'

export interface RegisterInfo {
  jp: string
  en: string
  color: string
  desc: string
  tips: string
  midiNotes: number[]
}

export const REGISTER_INFO: Record<'chest' | 'mix' | 'falsetto', RegisterInfo> = {
  chest: {
    jp: '地声',
    en: 'Chest Voice',
    color: '#f97316',
    desc: '声帯全体が振動する、太く力強い声。話し声に近い発声。',
    tips: '胸に手を当てて振動を感じながら発声。「アー」と強く共鳴させる。',
    midiNotes: [48, 50, 52, 53, 55, 57, 59, 60], // C3-C4 scale
  },
  mix: {
    jp: 'ミックス',
    en: 'Mix Voice',
    color: '#a855f7',
    desc: '地声と裏声をブレンドした中間の発声。パッサッジョ（換声点）をまたぐ声。',
    tips: '地声の響きを保ちながら、徐々に軽くしていく。喉をリラックスさせて力まない。',
    midiNotes: [60, 62, 64, 65, 67], // C4-G4 passaggio zone
  },
  falsetto: {
    jp: '裏声',
    en: 'Falsetto',
    color: '#38bdf8',
    desc: '声帯の縁だけが振動する、軽く澄んだ声。頭の上から抜ける感覚。',
    tips: '「フー」と息を混ぜながら優しく発声。力を抜いて、頭の上から声を出すイメージ。',
    midiNotes: [67, 69, 71, 72, 74], // G4-D5 falsetto range
  },
}

export function detectVoiceRegister(resonanceData: ResonanceData | null): VoiceRegister {
  if (!resonanceData) return 'none'
  const { totalHarmonics, brightnessScore } = resonanceData
  if (totalHarmonics >= 5 && brightnessScore > 30) return 'chest'
  if (totalHarmonics <= 2 || brightnessScore < 10) return 'falsetto'
  return 'mix'
}

export function harmonicRichnessScore(resonanceData: ResonanceData | null): number {
  if (!resonanceData) return 0
  const { totalHarmonics, brightnessScore } = resonanceData
  return Math.min(100, Math.round((totalHarmonics / 12) * 60 + brightnessScore * 0.4))
}
