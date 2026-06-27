// YIN algorithm for monophonic pitch detection
// Reference: de Cheveigné & Kawahara (2002) "YIN, a fundamental frequency estimator"

export function computeRMS(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  if (computeRMS(buffer) < 0.003) return null

  const minFreq = 60
  const maxFreq = 3500
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq))
  const maxTau = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(buffer.length / 2))
  const threshold = 0.18

  // Step 1: Difference function (only for relevant tau range)
  const d = new Float32Array(maxTau + 1)
  for (let tau = minTau; tau <= maxTau; tau++) {
    for (let j = 0; j < maxTau; j++) {
      const delta = buffer[j] - buffer[j + tau]
      d[tau] += delta * delta
    }
  }

  // Step 2: Cumulative mean normalized difference function (CMNDF)
  const dp = new Float32Array(maxTau + 1)
  dp[0] = 1
  let cumSum = 0
  for (let tau = 1; tau <= maxTau; tau++) {
    cumSum += d[tau]
    dp[tau] = cumSum > 0 ? (tau * d[tau]) / cumSum : 1
  }

  // Step 3: Find first tau below threshold (absolute threshold method)
  let tau = minTau
  while (tau <= maxTau) {
    if (dp[tau] < threshold) {
      while (tau + 1 <= maxTau && dp[tau + 1] < dp[tau]) tau++
      break
    }
    tau++
  }

  // Fallback: global minimum if nothing below threshold
  if (tau > maxTau) {
    let minVal = dp[minTau]
    let minIdx = minTau
    for (let t = minTau + 1; t <= maxTau; t++) {
      if (dp[t] < minVal) { minVal = dp[t]; minIdx = t }
    }
    if (minVal > 0.40) return null
    tau = minIdx
  }

  // Step 4: Parabolic interpolation for sub-sample accuracy
  let betterTau = tau
  if (tau > minTau && tau < maxTau) {
    const s0 = dp[tau - 1]
    const s1 = dp[tau]
    const s2 = dp[tau + 1]
    const denom = 2 * s1 - s2 - s0
    if (denom !== 0) betterTau = tau + (s2 - s0) / (2 * denom)
  }

  const frequency = sampleRate / betterTau
  if (frequency < minFreq || frequency > maxFreq) return null
  return frequency
}
