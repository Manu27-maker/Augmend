/**
 * Small-sample proportion statistics for evaluation reports.
 *
 * Wilson score intervals are used instead of the normal approximation because
 * benchmark sets are small and proportions near 0 or 1 make the normal
 * interval collapse or run outside [0, 1].
 */

const Z_95 = 1.959963984540054

export function wilsonInterval(successes, total, z = Z_95) {
  if (!Number.isFinite(total) || total <= 0) return null

  const n = total
  const point = Math.min(1, Math.max(0, successes / n))
  const z2 = z * z
  const denominator = 1 + z2 / n
  const center = (point + z2 / (2 * n)) / denominator
  const margin =
    (z * Math.sqrt((point * (1 - point)) / n + z2 / (4 * n * n))) / denominator

  return {
    point,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  }
}
