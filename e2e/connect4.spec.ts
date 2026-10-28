import { type Page, expect, test } from '@playwright/test'
import { hostTable, joinTable, skipBoot, twoPlayers, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

/** A column's button, by its number on the rack (1 to 7). */
const column = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^Column ${n},`) })
const openColumns = (page: Page) => page.locator('.c4-column.is-open[aria-disabled="false"]')
/** Checkers in the rack, not counting last game's falling out of it. */
const checkers = (page: Page) => page.locator('.c4-checker:not([data-anim="release"])')
const status = (page: Page) => page.locator('.c4-hud__status')
const moveLog = (page: Page) => page.getByRole('list', { name: 'Move log' })

/** Sit down against the first opponent on the ladder, playing Red. */
async function sitDown(page: Page) {
  await page.goto('/#/connect4')
  await page.getByRole('button', { name: 'Sit down' }).click()
  await expect(page.getByRole('group', { name: 'Connect Four rack' })).toBeVisible()
}

async function hotseat(page: Page, names?: [string, string]) {
  await page.goto('/#/connect4')
  await page.getByRole('tab', { name: 'Hot-seat' }).click()
  if (names) {
    await page.getByLabel('Red, drops first').fill(names[0])
    await page.getByLabel('Yellow').fill(names[1])
  }
  await page.getByRole('button', { name: 'Start the game' }).click()
  await expect(page.getByRole('group', { name: 'Connect Four rack' })).toBeVisible()
}

/** Drop into these columns in turn, at hot-seat, waiting for each checker to show up. */
async function dropAll(page: Page, columns: number[]) {
  for (const n of columns) {
    const before = await checkers(page).count()
    await column(page, n).click()
    await expect(checkers(page)).toHaveCount(before + 1)
  }
}

for (const view of ['3D', 'flat'] as const) {
  test(`a Connect Four game against the AI drops checkers in turn (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('tab', { name: 'Board games' }).click()
    // First on the board games list, so it's chosen already.
    await expect(page.getByRole('option', { name: /Connect Four/ })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'Play Connect Four' }).click()
    await expect(page.getByRole('button', { name: /^Skeeter Malone/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Sit down' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-table3d', view === '3D' ? 'on' : 'off')

    // An empty rack, every column open, and a hello from Skeeter.
    await expect(checkers(page)).toHaveCount(0)
    await expect(openColumns(page)).toHaveCount(7)
    await expect(page.locator('.c4-talk__bubble')).toContainText('Skeeter Malone says:')
    await expect(page.locator('.c4-hover')).toHaveAttribute('data-c', '0')

    for (let move = 1; move <= 3; move++) {
      await expect(status(page)).toHaveText('Your turn', { timeout: 10_000 })
      await column(page, 4).click()
      // The checker falls from over the rack.
      await expect(page.locator('.c4-checker[data-anim="drop"]')).toHaveCount(1)
      await expect(moveLog(page).getByText('You drop into column 4.')).toHaveCount(move)
      await expect(moveLog(page).getByText(/^Skeeter Malone drops into column \d\.$/)).toHaveCount(move, { timeout: 10_000 })
    }
    // Every checker in the rack is counted off the plates.
    await expect(checkers(page)).toHaveCount(6)
    const you = Number(await page.locator('.c4-bar--bottom .c4-bar__number').textContent())
    const skeeter = Number(await page.locator('.c4-bar--top .c4-bar__number').textContent())
    expect(you + skeeter).toBe(42 - 6)
    await expect(column(page, 4)).toHaveAccessibleName(/^Column 4, red, .* from the bottom, room for \d$/)
    expect(errors).toEqual([])
  })
}

test('the keyboard moves the checker along the rack and drops it', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page)
  await page.keyboard.press('4')
  await expect(moveLog(page).getByText('You drop into column 4.')).toBeVisible()

  // Wait for Skeeter, then slide two columns left and press Enter.
  await expect(status(page)).toHaveText('Your turn', { timeout: 10_000 })
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.c4-column.is-cursor')).toHaveAttribute('data-col', '1')
  await expect(page.locator('.c4-hover')).toHaveAttribute('style', /--c: 1/)
  await page.keyboard.press('Enter')
  await expect(moveLog(page).getByText('You drop into column 2.')).toBeVisible()
  expect(errors).toEqual([])
})

test('hot-seat hands the rack back and forth, and a full column says so', async ({ page }) => {
  const errors = watchErrors(page)
  await hotseat(page, ['Ada', 'Ben'])
  await expect(status(page)).toHaveText('Ada to play')
  await column(page, 1).click()
  await expect(status(page)).toHaveText('Ben to play')
  await expect(page.locator('.c4-hover')).toHaveAttribute('data-c', '1')
  await dropAll(page, [1, 1, 1, 1, 1])
  await expect(moveLog(page).getByText(/^Ada drops/)).toHaveCount(3)
  await expect(moveLog(page).getByText(/^Ben drops/)).toHaveCount(3)
  await expect(column(page, 1)).toHaveAccessibleName(/full$/)
  await expect(column(page, 1)).toHaveAttribute('aria-disabled', 'true')
  await column(page, 1).click({ force: true })
  await expect(page.locator('.c4-hud__help')).toHaveText('Column 1 is full. Pick another.')
  await expect(checkers(page)).toHaveCount(6)
  // Nobody is thinking; both plates belong to people.
  await expect(page.locator('.c4-portrait')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('four in a row lights up, and Play again pulls the slider to empty the rack', async ({ page }) => {
  const errors = watchErrors(page)
  await hotseat(page)
  await dropAll(page, [4, 4, 3, 3, 5, 5, 2])
  await expect(page.locator('.c4-ring')).toHaveCount(4)
  await expect(page.locator('.c4-checker.is-win')).toHaveCount(4)
  const over = page.getByRole('dialog', { name: 'Player 1 wins' })
  await expect(over).toBeVisible({ timeout: 5000 })
  await expect(over).toContainText('Four across the bottom row.')
  await over.getByRole('button', { name: 'Play again' }).click()
  // Last game's checkers fall out of the bottom, and the new game starts empty.
  await expect(page.locator('.c4-checker[data-anim="release"]')).toHaveCount(7)
  await expect(page.locator('.c4-slider')).toHaveClass(/is-pulled/)
  await expect(checkers(page)).toHaveCount(0)
  await expect(page.locator('.c4-checker[data-anim="release"]')).toHaveCount(0, { timeout: 3000 })
  await expect(status(page)).toHaveText('Player 1 to play')
  await expect(moveLog(page).getByText('Player 1 wins with four across the bottom row.')).toBeVisible()
  await dropAll(page, [4])
  expect(errors).toEqual([])
})

test('Threats marks the holes that would make four', async ({ page }) => {
  const errors = watchErrors(page)
  await hotseat(page)
  const threats = page.getByRole('button', { name: 'Threats' })
  await expect(threats).toHaveAttribute('aria-pressed', 'false')
  // Red: three along the bottom from column 2, with Yellow at the right end.
  await dropAll(page, [4, 5, 3, 5, 2])
  await expect(page.locator('.c4-threat')).toHaveCount(0)
  await threats.click()
  await expect(threats).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.c4-threat[data-c="0"]')).toHaveCount(1)
  await expect(page.locator('.c4-hud__help')).toContainText('Rings mark the holes that would make four.')
  // Yellow blocks it, and the mark goes.
  await dropAll(page, [1])
  await expect(page.locator('.c4-threat')).toHaveCount(0)
  // It stays on for the next visit.
  await page.reload()
  await page.goto('/#/connect4')
  await page.getByRole('button', { name: 'Sit down' }).click()
  await expect(page.getByRole('button', { name: 'Threats' })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('a whole game against Skeeter goes on the record', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = watchErrors(page)
  await sitDown(page)
  const over = page.getByRole('dialog', { name: /win|A draw/ })
  // Drop in the leftmost open column every time it's our move, until the game ends.
  await expect(async () => {
    if (await over.isVisible()) return
    const open = openColumns(page).first()
    if ((await status(page).textContent()) === 'Your turn' && (await open.count())) await open.click({ timeout: 500 })
    await expect(over).toBeVisible({ timeout: 200 })
  }).toPass({ timeout: 110_000, intervals: [100] })

  await over.getByRole('button', { name: 'Look at the rack' }).click()
  await expect(status(page)).toHaveText('Game over')
  await page.getByRole('button', { name: 'Leave table' }).click()
  await page.getByRole('link', { name: 'Back to the hub' }).click()
  await page.getByRole('link', { name: 'Records' }).click()
  await expect(page.getByRole('row', { name: /Connect Four/ }).getByRole('cell').first()).toHaveText('1')
  expect(errors).toEqual([])
})

test('leaving a game against the AI early counts as a loss', async ({ page }) => {
  await sitDown(page)
  await column(page, 4).click()
  await page.getByRole('button', { name: 'Leave table' }).click()
  await page.getByRole('button', { name: 'Resign the game' }).click()
  await expect(page.getByRole('button', { name: 'Sit down' })).toBeVisible()
  await page.goto('/#/records')
  await expect(page.getByRole('row', { name: /Connect Four/ }).getByRole('cell').nth(2)).toHaveText('1')
})

test('the rules page explains the game', async ({ page }) => {
  await page.goto('/#/connect4/rules')
  await expect(page.getByRole('heading', { name: 'How to play Connect Four' })).toBeVisible()
  await expect(page.getByText(/Four in a row/).first()).toBeVisible()
})

test('two players play Connect Four online, colors swap for the rematch, and leaving resigns', async ({ browser }) => {
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'connect4', 'Hostess')
  await joinTable(guest, 'connect4', code, 'Guesty')

  await expect(host.getByRole('list', { name: 'Players' })).toContainText('Guesty')
  await host.getByLabel('Red, drops first').check()
  await host.getByRole('button', { name: 'Start' }).click()

  for (const page of [host, guest]) await expect(page.getByRole('group', { name: 'Connect Four rack' })).toBeVisible()
  await expect(status(host)).toHaveText('Your turn')
  await expect(status(guest)).toHaveText('Hostess to play')
  await expect(openColumns(guest)).toHaveCount(0)

  // Red up column 1, Yellow up column 2: each drop turns up on the other rack.
  for (let i = 0; i < 3; i++) {
    await column(host, 1).click()
    await expect(checkers(guest)).toHaveCount(i * 2 + 1)
    await expect(status(guest)).toHaveText('Your turn')
    await column(guest, 2).click()
    await expect(checkers(host)).toHaveCount(i * 2 + 2)
  }
  await expect(host.getByRole('list', { name: 'Move log' })).toContainText('Guesty drops into column 2.')
  await expect(guest.getByRole('list', { name: 'Move log' })).toContainText('You drop into column 2.')
  await column(host, 1).click()
  await expect(host.getByRole('dialog').getByRole('heading', { name: 'You win' })).toBeVisible({ timeout: 10_000 })
  await expect(guest.getByRole('dialog').getByRole('heading', { name: 'Hostess wins' })).toBeVisible({ timeout: 10_000 })
  const board = (page: Page) => checkers(page).evaluateAll((cs) => cs.map((c) => `${c.getAttribute('data-c')}@${(c as HTMLElement).style.cssText}`).sort())
  expect(await board(host)).toEqual(await board(guest))

  // The rematch: the guest plays Red now, and drops first.
  await guest.getByRole('dialog').getByRole('button', { name: 'Play again' }).click()
  await expect(status(guest)).toHaveText('Your turn', { timeout: 10_000 })
  await expect(status(host)).toHaveText('Guesty to play')
  await expect(guest.locator('.c4-hover')).toHaveAttribute('data-c', '0')
  await column(guest, 4).click()
  await expect(checkers(host)).toHaveCount(1)

  // The guest gets up mid-game: that's a resignation.
  await guest.getByRole('button', { name: 'Leave table' }).click()
  await guest.getByRole('button', { name: 'Resign the game' }).click()
  await expect(guest).toHaveURL(/#\/connect4$/)
  await expect(host.getByRole('dialog').getByRole('heading', { name: 'You win' })).toBeVisible({ timeout: 10_000 })
  await expect(host.getByText('Guesty resigned.')).toBeVisible()

  expect(errors.flat()).toEqual([])
  await context.close()
})
