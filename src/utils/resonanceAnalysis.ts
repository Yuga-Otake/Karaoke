export interface HarmonicInfo {
  number: number        // Harmonic number (1 = fundamental)
  frequency: number     // Frequency in Hz
  amplitude: number     // Normalized 0-1
  db: number            // Raw dB value from FFT
}

export interface ResonanceData {
  harmonics: HarmonicInfo[]
  resonanceScore: number      // 0-100: overall resonance quality
  harmoniScore: number        // 0-100: how harmonic the overtone structure is
  brightnessScore: number     // 0-100: spectral brightness (upper harmonics strength)
  clarityScore: number        // 0-100: fundamental clarity
  spectralCentroid: number    // Hz: brightness indicator
  totalHarmonics: number      // How many harmonics detected above noise floor
}

export function analyzeResonance(
  spectrum: Float32Array,
  fundamental: number,
  sampleRate: number,
  fftSize: number,
): ResonanceData {
  const binSize = sampleRate / fftSize
  const noiseFloor = -70 // dB

  const harmonics: HarmonicInfo[] = []
  const maxHarmonics = 12

  for (let h = 1; h <= maxHarmonics; h++) {
    const targetFreq = fundamental * h
    if (targetFreq > sampleRate / 2) break

    const targetBin = Math.round(targetFreq / binSize)
    if (targetBin >= spectrum.length) break

    // Peak in ±4 bins neighborhood
    let maxDb = -Infinity
    const searchRadius = Math.max(2, Math.round(fundamental * 0.02 / binSize))
    for (let offset = -searchRadius; offset <= searchRadius; offset++) {
      const bin = targetBin + offset
      if (bin >= 0 && bin < spectrum.length) {
        maxDb = Math.max(maxDb, spectrum[bin])
      }
    }

    harmonics.push({
      number: h,
      frequency: targetFreq,
      amplitude: 0, // normalized below
      db: maxDb,
    })
  }

  if (harmonics.length === 0) {
    return {
      harmonics: [],
      resonanceScore: 0,
      harmoniScore: 0,
      brightnessScore: 0,
      clarityScore: 0,
      spectralCentroid: 0,
      totalHarmonics: 0,
    }
  }

  // Normalize amplitudes relative to the strongest harmonic
  const maxDb = Math.max(...harmonics.map(h => h.db))
  for (const h of harmonics) {
    h.amplitude = Math.pow(10, (h.db - maxDb) / 20)
  }

  // Clarity score: how strong is the fundamental
  const fundamentalDb = harmonics[0].db
  const clarityScore = Math.max(0, Math.min(100, (fundamentalDb + 90) / 40 * 100))

  // Count harmonics above noise floor
  const totalHarmonics = harmonics.filter(h => h.db > noiseFloor).length

  // Harmonic score: how well harmonics follow natural decay
  // Natural: each harmonic decays by ~6dB per doubling (1/n amplitude)
  let harmoniScore = 0
  if (totalHarmonics > 1) {
    const presentHarmonics = harmonics.filter(h => h.db > noiseFloor)
    let sumScore = 0
    for (let i = 1; i < presentHarmonics.length; i++) {
      const expected_dB_drop = 20 * Math.log10(i + 1) // Expected drop relative to H1
      const actual_dB_drop = presentHarmonics[0].db - presentHarmonics[i].db
      const deviation = Math.abs(actual_dB_drop - expected_dB_drop)
      sumScore += Math.max(0, 1 - deviation / 24)
    }
    harmoniScore = Math.round((sumScore / (presentHarmonics.length - 1)) * 100)
  }

  // Brightness: strength of harmonics H3-H8 relative to H1+H2
  let brightnessScore = 0
  const lowerEnergy = harmonics.slice(0, 2).reduce((s, h) => s + Math.pow(10, h.db / 10), 0)
  const upperEnergy = harmonics.slice(2, 8).reduce((s, h) => s + Math.pow(10, Math.max(h.db, noiseFloor) / 10), 0)
  if (lowerEnergy > 0) {
    brightnessScore = Math.round(Math.min(100, (upperEnergy / lowerEnergy) * 80))
  }

  // Spectral centroid (frequency weighted average of spectrum power)
  let weightedSum = 0
  let totalWeight = 0
  for (let i = 0; i < Math.min(spectrum.length, Math.round(8000 / binSize)); i++) {
    const freq = i * binSize
    const power = Math.pow(10, Math.max(spectrum[i], noiseFloor) / 10)
    weightedSum += freq * power
    totalWeight += power
  }
  const spectralCentroid = totalWeight > 0 ? weightedSum / totalWeight : 0

  // Overall resonance score: blend of clarity, harmonic structure, and appropriate brightness
  const resonanceScore = Math.round(
    clarityScore * 0.35 +
    harmoniScore * 0.40 +
    Math.min(brightnessScore, 70) * 0.25
  )

  return {
    harmonics,
    resonanceScore: Math.max(0, Math.min(100, resonanceScore)),
    harmoniScore: Math.max(0, Math.min(100, harmoniScore)),
    brightnessScore: Math.max(0, Math.min(100, brightnessScore)),
    clarityScore: Math.max(0, Math.min(100, clarityScore)),
    spectralCentroid,
    totalHarmonics,
  }
}
