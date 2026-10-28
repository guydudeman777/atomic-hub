import { beforeEach, describe, expect, it } from 'vitest'
import type { Entry } from '../../../net/link'
import { useSave } from '../../../store/save'
import { type Input, sendThrough, useSession } from './session'

/** An online table where you're the guest in seat 1: what you send waits until the host plays it back. */
function sitAsGuest() {
  const sent: Input[] = []
  sendThrough((input) => sent.push(input))
  useSession.getState().sit({
    stakesId: 'salon',
    wheel: 'european',
    online: { me: 1, host: false, players: [{ seat: 0, name: 'Hostess' }, { seat: 1, name: 'You' }] },
  })
  /** The host numbers everything sent so far and plays it back to every table. */
  const playBack = () => {
    const entries: Entry[] = sent.splice(0).map((input, i) => ({ seq: i, seat: 1, input }))
    useSession.getState().receive(entries)
    useSession.getState().pump()
  }
  return { sent, playBack }
}

beforeEach(() => {
  useSave.getState().resetSave()
  // The session plays its sounds through the page; there's none here.
  useSave.getState().updateSettings({ sound: false })
  useSession.getState().leave()
  sendThrough(null)
})

describe('betting online', () => {
  it('counts bets on their way to the table against your caps', () => {
    useSave.getState().adjustCaps(10 - useSave.getState().wallet.caps)
    const { sent, playBack } = sitAsGuest()
    useSession.getState().pickChip(5)
    // Three quick clicks on red, before the table has played back the first.
    for (let i = 0; i < 3; i++) useSession.getState().bet('red')
    expect(sent.map((input) => input.type === 'bet' && input.available)).toEqual([10, 5])
    playBack()
    expect(useSession.getState().state?.bets.red).toBe(10)
    expect(useSave.getState().wallet.caps).toBe(0)
    // Once they're played, the caps are spent rather than on their way.
    useSave.getState().adjustCaps(5)
    useSession.getState().bet('red')
    expect(sent.at(-1)).toMatchObject({ type: 'bet', spot: 'red', amount: 5, available: 5 })
  })

  it('a bet that fails at the table frees its caps for the next one', () => {
    useSave.getState().adjustCaps(20 - useSave.getState().wallet.caps)
    const { sent, playBack } = sitAsGuest()
    useSession.getState().pickChip(5)
    useSession.getState().bet('red')
    // The table moves on before the bet is played: it's dropped, and its 5 caps never leave the wallet.
    sent[0] = { ...(sent[0] as Extract<Input, { type: 'bet' }>), n: 99 }
    playBack()
    expect(useSession.getState().state?.bets.red).toBeUndefined()
    useSession.getState().bet('black')
    expect(sent.at(-1)).toMatchObject({ type: 'bet', spot: 'black', available: 20 })
  })
})
