import { describe, expect, it } from 'vitest'
import { breakdown } from './chips'

describe('chip stacks', () => {
  it('use the fewest chips, biggest at the bottom', () => {
    expect(breakdown(37)).toEqual([25, 5, 5, 1, 1])
    expect(breakdown(2600)).toEqual([1000, 1000, 500, 100])
    expect(breakdown(0)).toEqual([])
  })
})
