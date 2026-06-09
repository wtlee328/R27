/**
 * Generates a contract number in the format: YYYMMDDNN
 * YYY = ROC year (AD year - 1911)
 * MM  = month (2 digits)
 * DD  = day (2 digits)
 * NN  = daily sequence (2 digits, 01-99)
 *
 * Example: 11506040 1 → contract #1 on 2026/06/04 ROC 115
 */
export function generateContractNo(date: Date, sequence: number): string {
  const rocYear = date.getFullYear() - 1911
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const seq = String(sequence).padStart(2, '0')
  return `${rocYear}${month}${day}${seq}`
}

/**
 * Given a list of existing contractNos, find the next sequence number
 * for today's date prefix (YYYMMDD).
 */
export function nextDailySequence(today: Date, existingNos: string[]): number {
  const rocYear = today.getFullYear() - 1911
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  const prefix = `${rocYear}${month}${day}`

  const todayNos = existingNos.filter(no => no.startsWith(prefix))
  if (todayNos.length === 0) return 1

  const sequences = todayNos.map(no => parseInt(no.slice(prefix.length), 10)).filter(n => !isNaN(n))
  return sequences.length > 0 ? Math.max(...sequences) + 1 : 1
}
