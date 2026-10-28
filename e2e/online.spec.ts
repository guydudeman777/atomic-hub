import { type Page, expect, test } from '@playwright/test'
import { finishBlackjackRound, finishDrawHand, hostTable, joinTable, twoPlayers, watchErrors } from './helpers.ts'

/**
 * Online tables, with two tabs of one browser talking over a
 * BroadcastChannel (`?net=local`) instead of the Nostr relays.
 */

test('two players play Reversi online, and a resignation ends it', async ({ browser }) => {
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'reversi', 'Hostess')
  await joinTable(guest, 'reversi', code, 'Guesty')

  await expect(host.getByRole('list', { name: 'Players' })).toContainText('Guesty')
  await host.getByLabel('Black, moves first').check()
  await host.getByRole('button', { name: 'Start' }).click()

  for (const page of [host, guest]) await expect(page.getByRole('group', { name: 'Reversi board' })).toBeVisible()
  const status = (page: Page) => page.locator('.rv-hud__status')
  const legal = (page: Page) => page.getByRole('button', { name: /you can play here/ })
  await expect(status(host)).toHaveText('Your turn')
  await expect(status(guest)).toHaveText('Hostess to play')
  await expect(legal(guest)).toHaveCount(0)

  // Black, then White, then Black again: each move turns up on the other board.
  await legal(host).first().click()
  await expect(guest.locator('.rv-disc')).toHaveCount(5)
  await expect(status(guest)).toHaveText('Your turn')
  await legal(guest).first().click()
  await expect(host.locator('.rv-disc')).toHaveCount(6)
  await expect(host.getByRole('list', { name: 'Move log' })).toContainText(/Guesty plays [a-h][1-8]/)
  await expect(guest.getByRole('list', { name: 'Move log' })).toContainText(/You play [a-h][1-8]/)
  const board = (page: Page) => page.locator('.rv-disc').evaluateAll((discs) => discs.map((d) => d.closest('[data-square]')?.getAttribute('data-square')).sort())
  expect(await board(host)).toEqual(await board(guest))

  // The guest gets up mid-game: that's a resignation.
  await guest.getByRole('button', { name: 'Leave table' }).click()
  await guest.getByRole('button', { name: 'Resign the game' }).click()
  await expect(guest).toHaveURL(/#\/reversi$/)
  await expect(host.getByRole('dialog').getByRole('heading', { name: 'You win' })).toBeVisible({ timeout: 10_000 })
  await expect(host.getByText('Guesty resigned.')).toBeVisible()

  expect(errors.flat()).toEqual([])
  await context.close()
})

test('a code nobody is hosting, or a mistyped one, says so', async ({ browser }) => {
  const { context, host } = await twoPlayers(browser)
  await host.goto('/?net=local#/reversi')
  await host.getByRole('tab', { name: 'Online' }).click()
  await host.getByLabel('Table code').fill('abc')
  await host.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByText(/A code is six letters and numbers/)).toBeVisible()
  await context.close()
})

test('the guest’s table closes when the host closes it', async ({ browser }) => {
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'reversi', 'Hostess')
  await joinTable(guest, 'reversi', code, 'Guesty')
  await host.getByRole('button', { name: 'Start' }).click()
  await expect(guest.getByRole('group', { name: 'Reversi board' })).toBeVisible()
  await host.getByRole('button', { name: 'Leave table' }).click()
  await host.getByRole('button', { name: 'Resign the game' }).click()
  await expect(guest.getByRole('alert')).toContainText('The host closed the table.')
  await guest.getByRole('button', { name: 'Back to the lobby' }).click()
  await expect(guest).toHaveURL(/#\/reversi$/)
  expect(errors.flat()).toEqual([])
  await context.close()
})

test('two players play Caravan online, each with their own hand', async ({ browser }) => {
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'caravan', 'Hostess')
  await joinTable(guest, 'caravan', code, 'Guesty')
  await host.getByRole('button', { name: 'Start' }).click()

  const status = (page: Page) => page.locator('.cv-hud__status')
  for (const page of [host, guest]) await expect(page.getByLabel('Your hand')).toBeVisible({ timeout: 10_000 })
  const log = (page: Page) => page.getByRole('list', { name: 'Move log' })
  const first = (await log(host).textContent())?.includes('You go first') ? host : guest
  const second = first === host ? guest : host

  // The opening: three number cards each, taking turns, and every move shows on both tables.
  for (let turn = 1; turn <= 3; turn++) {
    for (const page of [first, second]) {
      await expect(status(page)).toHaveText(new RegExp(`Opening.*\\(${turn} of 3\\)`), { timeout: 10_000 })
      await page.locator('.cv-hand__card:not(.is-dim)').first().click()
      await page.locator('.cv-caravan.is-drop').first().click()
    }
  }
  await expect(status(first)).toHaveText('Your turn')
  await expect(log(first).getByText(/^You played/)).toHaveCount(3)
  await expect(log(second).getByText(/^You played/)).toHaveCount(3)
  const theirName = first === host ? 'Guesty' : 'Hostess'
  await expect(log(first).getByText(new RegExp(`^${theirName} played`))).toHaveCount(3)
  // Both tables agree on the lanes: each plaque reads theirs, then yours.
  const lanes = (page: Page) => page.locator('.cv-plaque').evaluateAll((ps) => ps.map((p) => p.getAttribute('aria-label')!.match(/\d+/g)!.map(Number)))
  const hostLanes = await lanes(host)
  expect(hostLanes).toHaveLength(3)
  expect(await lanes(guest)).toEqual(hostLanes.map((l) => [...l].reverse()))

  // Getting up mid-game resigns it.
  await second.getByRole('button', { name: 'Leave table' }).click()
  await second.getByRole('button', { name: 'Resign and leave' }).click()
  await expect(first.getByRole('heading', { name: 'You win' })).toBeVisible({ timeout: 10_000 })
  expect(errors.flat()).toEqual([])
  await context.close()
})

test('two players share a Blackjack table online, with the regulars', async ({ browser }) => {
  // Two rounds dealt at the table's own pace.
  test.setTimeout(90_000)
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'blackjack', 'Hostess')
  await joinTable(guest, 'blackjack', code, 'Guesty')
  await host.getByRole('button', { name: 'Start' }).click()
  for (const page of [host, guest]) await expect(page.getByRole('region', { name: 'Blackjack table' })).toBeVisible({ timeout: 10_000 })

  // Each sees the other at the table, and two regulars in the other seats.
  await expect(host.locator('.bj-plate.is-player')).toHaveText('Guesty')
  await expect(guest.locator('.bj-plate.is-player')).toHaveText('Hostess')
  await expect(host.locator('.bj-plate:not(.is-player):not(.is-you):not(.is-open)')).toHaveCount(3)

  // The deal waits for both bets.
  await host.getByRole('button', { name: /^Deal/ }).click()
  await expect(host.getByText(/Waiting for Guesty to bet/)).toBeVisible()
  await guest.getByRole('button', { name: /^Deal/ }).click()
  await Promise.all([finishBlackjackRound(host), finishBlackjackRound(guest)])

  // Both tables played the same round.
  const dealerLines = (page: Page) =>
    page.getByRole('list', { name: 'Table log' }).locator('li').evaluateAll((lis) => lis.map((li) => li.textContent!).filter((t) => /^The dealer (stands|busts|checks)/.test(t)))
  await expect.poll(() => dealerLines(guest)).toEqual(await dealerLines(host))
  expect((await dealerLines(host)).length).toBeGreaterThan(0)

  // A second round, then the guest gets up and the host plays on.
  await guest.getByRole('button', { name: 'Leave table' }).click()
  await expect(host.getByRole('list', { name: 'Table log' })).toContainText('Guesty gets up from the table.')
  await host.getByRole('button', { name: /^Deal/ }).click()
  await finishBlackjackRound(host)
  expect(errors.flat()).toEqual([])
  await context.close()
})

test('three players at an online Five-Card Draw table, each seeing it from their own chair', async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, host, guest, errors } = await twoPlayers(browser)
  const third = await context.newPage()
  errors.push(watchErrors(third))
  const code = await hostTable(host, 'draw', 'Hostess')
  await joinTable(guest, 'draw', code, 'Guesty')
  await joinTable(third, 'draw', code, 'Thirza')
  await host.getByLabel('Regulars sitting in').selectOption('1')
  await host.getByRole('button', { name: 'Start' }).click()
  const pages = [host, guest, third]
  for (const page of pages) await expect(page.getByRole('region', { name: 'Poker table' })).toBeVisible({ timeout: 10_000 })

  // Three players and a regular, each with their own plate at the foot of the table.
  for (const page of pages) {
    await expect(page.locator('.dw-plate:not(.is-open)')).toHaveCount(4)
    await expect(page.locator('.dw-plate.is-you')).toHaveCount(1)
    await expect(page.locator('.dw-plate.is-player')).toHaveCount(2)
  }

  for (const page of pages) await page.getByRole('button', { name: /^Deal/ }).first().click()
  // Each sees their own five cards, and nobody else's.
  for (const page of pages) {
    await expect(page.locator('.dw-card.is-yours')).toHaveCount(5, { timeout: 15_000 })
    await expect(page.locator('.dw-card:not(.is-yours):not([data-down])')).toHaveCount(0)
  }
  await Promise.all(pages.map((page) => finishDrawHand(page)))

  // Every table saw the same hand: the same lines about who won.
  const wins = (page: Page) =>
    page.getByRole('list', { name: 'Table log' }).locator('li').evaluateAll((lis) => lis.map((li) => li.textContent!).filter((t) => / wins? \d+/.test(t)).map((t) => t.replace(/^You win/, '· wins').replace(/^(Hostess|Guesty|Thirza) wins/, '· wins')))
  await expect.poll(() => wins(guest)).toEqual(await wins(host))
  await expect.poll(() => wins(third)).toEqual(await wins(host))
  expect(errors.flat()).toEqual([])
  await context.close()
})

test('two players at an online Craps table: the same dice, and the dice go round', async ({ browser }) => {
  test.setTimeout(90_000)
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'craps', 'Hostess')
  await joinTable(guest, 'craps', code, 'Guesty')
  await host.getByRole('button', { name: 'Start' }).click()
  for (const page of [host, guest]) await expect(page.getByRole('region', { name: 'Craps layout' })).toBeVisible({ timeout: 10_000 })

  // The host shoots first; the guest sees whose dice they are, and each sees the other at the rail.
  await expect(host.getByRole('button', { name: /^Roll/ })).toBeEnabled()
  await expect(guest.getByRole('button', { name: 'Hostess has the dice' })).toBeDisabled()
  await expect(host.locator('.cr-plate.is-player')).toContainText('Guesty')
  await expect(guest.locator('.cr-plate.is-player')).toContainText('Hostess')

  // Both bet the pass line; the guest's chips show on the host's rail.
  for (const page of [host, guest]) await page.getByRole('button', { name: /^Pass line/ }).click()
  await expect(host.locator('.cr-plate.is-player .cr-plate__stack')).not.toHaveText('0')

  // Roll until the dice change hands, keeping a line bet down on every come-out.
  const rolls = (page: Page) => page.locator('.cr-hud__rolls li').allTextContents()
  await expect(async () => {
    const shooter = (await host.getByRole('button', { name: /^Roll/ }).isEnabled().catch(() => false)) ? host : guest
    const other = shooter === host ? guest : host
    if (await shooter.getByRole('button', { name: /^Roll/ }).isEnabled({ timeout: 500 }).catch(() => false)) {
      if ((await shooter.locator('.cr-hud__status').textContent())?.startsWith('Coming out')) {
        await shooter.getByRole('button', { name: /^Pass line/ }).click({ timeout: 500 }).catch(() => {})
      }
      await shooter.getByRole('button', { name: /^Roll/ }).click({ timeout: 500 }).catch(() => {})
    }
    expect(await rolls(other)).toEqual(await rolls(shooter))
    await expect(guest.getByRole('button', { name: /^Roll/ })).toBeEnabled({ timeout: 1500 })
  }).toPass({ timeout: 75_000 })
  await expect(guest.getByRole('list', { name: 'Table log' })).toContainText('The dice come to you.')
  await expect.poll(() => rolls(guest)).toEqual(await rolls(host))
  expect(errors.flat()).toEqual([])
  await context.close()
})
