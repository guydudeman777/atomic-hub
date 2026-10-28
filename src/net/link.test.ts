import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanCode, codeFromPath, newCode } from './codes'
import { FIND_TIMEOUT_MS, Link, type LinkOptions, PROTOCOL, isSys } from './link'
import { type MemoryNetwork, memoryNetwork } from './memory'
import { fingerprint } from './store'

let net: MemoryNetwork
const ROOM = 'atomic-hub/test/ABCDEF'

beforeEach(() => {
  net = memoryNetwork()
})
afterEach(() => {
  vi.useRealTimers()
})

const options = (name: string, extra: Partial<LinkOptions> = {}): LinkOptions => ({
  game: 'test',
  name,
  seats: 4,
  lateJoin: true,
  transport: net.open(ROOM),
  token: `token-${name}`,
  ...extra,
})

async function table(guests: string[], extra: Partial<LinkOptions> = {}) {
  const host = await Link.host('ABCDEF', options('Hostess', extra))
  const joined: Link[] = []
  for (const name of guests) joined.push(await Link.join('ABCDEF', options(name, extra)))
  await net.settle()
  return { host, guests: joined }
}

describe('a table link', () => {
  it('seats guests in order and tells everyone who is there', async () => {
    const { host, guests } = await table(['Ann', 'Bo'])
    expect(guests.map((g) => g.status)).toEqual(['open', 'open'])
    expect(guests.map((g) => g.seat)).toEqual([1, 2])
    const names = host.roster.map((m) => m.name)
    expect(names).toEqual(['Hostess', 'Ann', 'Bo'])
    expect(guests[0].roster.map((m) => m.name)).toEqual(names)
  })

  it('numbers every input once and plays it at every table in the same order', async () => {
    const { host, guests } = await table(['Ann', 'Bo'])
    host.start({ seed: 7 })
    await net.settle()
    expect(guests[1].setup).toEqual({ seed: 7 })

    guests[0].submit({ move: 'a' })
    host.submit({ move: 'b' })
    guests[1].submit({ move: 'c' })
    await net.settle()
    const order = (l: Link) => l.log.map((e) => `${e.seq}:${e.seat}:${(e.input as { move: string }).move}`)
    expect(order(host)).toEqual(['0:0:b', '1:1:a', '2:2:c'])
    for (const g of guests) expect(order(g)).toEqual(order(host))
  })

  it('ignores inputs before the start', async () => {
    const { host, guests } = await table(['Ann'])
    guests[0].submit({ move: 'early' })
    host.submit({ move: 'early' })
    await net.settle()
    expect(host.log).toEqual([])
  })

  it('catches up a late arrival with the setup and every input so far, then announces them', async () => {
    const { host, guests } = await table(['Ann'])
    host.start({ seed: 1 })
    host.submit({ move: 'x' })
    const late = await Link.join('ABCDEF', options('Cy'))
    await net.settle()
    expect(late.setup).toEqual({ seed: 1 })
    expect(late.log.map((e) => e.input)).toEqual([{ move: 'x' }, { sys: 'join', name: 'Cy' }])
    expect(guests[0].log).toEqual(late.log)
    expect(isSys(late.log[1].input)).toBe(true)
  })

  it('turns a player leaving after the start into an input, and frees the seat', async () => {
    const { host, guests } = await table(['Ann', 'Bo'])
    host.start({})
    guests[0].leave()
    await net.settle()
    expect(host.log.at(-1)).toMatchObject({ seat: 1, input: { sys: 'leave' } })
    expect(guests[1].log).toEqual(host.log)
    expect(host.roster.map((m) => m.seat)).toEqual([0, 2])
    const next = await Link.join('ABCDEF', options('Di'))
    await net.settle()
    expect(next.seat).toBe(1)
  })

  it('treats a dropped connection like leaving', async () => {
    const { host, guests } = await table(['Ann'])
    host.start({})
    // The guest's peer is the second one opened.
    net.drop('peer2')
    await net.settle()
    expect(guests[0].status).toBe('open')
    expect(host.log.at(-1)).toMatchObject({ seat: 1, input: { sys: 'leave' } })
  })

  it('keeps a two-player seat for whoever left, and gives it back when they return', async () => {
    const { host, guests } = await table(['Ann'], { seats: 2, lateJoin: false })
    host.start({ seed: 3 })
    host.submit({ move: 'a' })
    await net.settle()
    guests[0].leave()
    await net.settle()
    expect(host.roster).toEqual([
      { seat: 0, name: 'Hostess', online: true },
      { seat: 1, name: 'Ann', online: false },
    ])
    expect(host.log).toHaveLength(1)

    // Someone else can't take it.
    const stranger = await Link.join('ABCDEF', options('Ed', { seats: 2, lateJoin: false }))
    await net.settle()
    expect(stranger.status).toBe('closed')
    expect(stranger.reason).toMatch(/already started/)

    // Ann's tab comes back with the same token.
    const back = await Link.join('ABCDEF', options('Ann', { seats: 2, lateJoin: false }))
    await net.settle()
    expect(back.seat).toBe(1)
    expect(back.log.map((e) => e.input)).toEqual([{ move: 'a' }])
    expect(host.roster[1].online).toBe(true)
  })

  it('turns away a full table, a second tab, and an old version', async () => {
    const { guests } = await table(['Ann'], { seats: 2 })
    const full = await Link.join('ABCDEF', options('Bo', { seats: 2 }))
    const twin = await Link.join('ABCDEF', options('Ann', { seats: 2, transport: net.open(ROOM) }))
    await net.settle()
    expect(full.reason).toMatch(/full/)
    expect(twin.reason).toMatch(/another tab/)
    expect(guests[0].status).toBe('open')

    const old = await Link.join('ABCDEF', options('Old'))
    // Speak an older protocol by hand.
    const raw = net.open(ROOM)
    let refusal: unknown = null
    raw.onMessage = (m) => {
      refusal = m
    }
    raw.send({ t: 'hello', v: PROTOCOL - 1, game: 'test', name: 'Old', token: 'old' })
    await net.settle()
    expect(refusal).toMatchObject({ t: 'refused', reason: expect.stringMatching(/different version/) })
    old.leave()
  })

  it('closes for the guests when the host leaves', async () => {
    const { host, guests } = await table(['Ann', 'Bo'])
    host.leave()
    await net.settle()
    expect(guests.map((g) => g.reason)).toEqual(['The host closed the table.', 'The host closed the table.'])
    expect(guests.every((g) => g.status === 'closed')).toBe(true)
  })

  it('closes for the guests when the host vanishes', async () => {
    const { guests } = await table(['Ann'])
    net.drop('peer1')
    await net.settle()
    expect(guests[0].reason).toBe('The host left the table.')
  })

  it('tells a guest whose checksum differs, whichever arrives first', async () => {
    const { host, guests } = await table(['Ann', 'Bo'])
    host.start({})
    host.submit({ move: 'a' })
    await net.settle()
    guests[0].checksum(0, 111)
    guests[1].checksum(0, 222)
    await net.settle()
    host.checksum(0, 111)
    await net.settle()
    expect(guests[0].status).toBe('open')
    expect(guests[1].status).toBe('closed')
    expect(guests[1].desynced).toBe(true)

    host.submit({ move: 'b' })
    await net.settle()
    host.checksum(1, 5)
    guests[0].checksum(1, 6)
    await net.settle()
    expect(guests[0].desynced).toBe(true)
  })

  it('gives up looking for a host that never answers', async () => {
    vi.useFakeTimers()
    const lonely = await Link.join('ZZZZZZ', options('Ann', { transport: net.open('elsewhere') }))
    expect(lonely.status).toBe('connecting')
    vi.advanceTimersByTime(FIND_TIMEOUT_MS + 1)
    expect(lonely.status).toBe('closed')
    expect(lonely.reason).toMatch(/Nobody’s hosting/)
  })

  it('keeps tables for different games apart', async () => {
    await Link.host('ABCDEF', options('Hostess'))
    const other = await Link.join('ABCDEF', options('Ann', { game: 'other' }))
    await net.settle()
    expect(other.status).toBe('connecting')
    other.leave()
  })
})

describe('table codes', () => {
  it('are six characters a person can read out', () => {
    for (let i = 0; i < 50; i++) expect(cleanCode(newCode())).not.toBeNull()
    expect(newCode(() => 0)).toBe('222222')
  })

  it('tidy what someone typed, and refuse what cannot be a code', () => {
    expect(cleanCode(' k7q-x2m ')).toBe('K7QX2M')
    expect(cleanCode('K7QX2')).toBeNull()
    expect(cleanCode('K7QX20')).toBeNull()
    expect(codeFromPath('/reversi/join/k7qx2m', 'reversi')).toBe('K7QX2M')
    expect(codeFromPath('/reversi/play', 'reversi')).toBeNull()
  })
})

describe('fingerprint', () => {
  it('is the same for equal values and differs for different ones', () => {
    expect(fingerprint({ a: [1, 2] })).toBe(fingerprint({ a: [1, 2] }))
    expect(fingerprint({ a: [1, 2] })).not.toBe(fingerprint({ a: [2, 1] }))
  })
})
