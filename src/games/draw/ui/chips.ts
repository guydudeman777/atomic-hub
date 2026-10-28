/** Every chip the bank issues, largest first. */
export const DENOMINATIONS = [500, 100, 25, 10, 5, 1] as const

/** The fewest chips that make `amount`, largest first. */
export function breakdown(amount: number): number[] {
  const chips: number[] = []
  let left = Math.max(0, Math.floor(amount))
  for (const value of DENOMINATIONS) {
    while (left >= value) {
      chips.push(value)
      left -= value
    }
  }
  return chips
}
