import { type Page, expect, test } from '@playwright/test'
import { hostTable, joinTable, skipBoot, twoPlayers, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

const openSquares = (page: Page) => page.getByRole('button', { name: /you can play here/ })
const status = (page: Page) => page.locator('.tt-hud__status')
const log = (page: Page) => page.getByRole('list', { name: 'Move log' })

/** Sit down against the first opponent on the ladder, playing X, at Classic or Ultimate. */
async function sitDown(page: Page, variant: 'Classic' | 'Ultimate' = 'Classic') {
  await page.goto('/#/tictactoe')
  await page.getByText(variant, { exact: true }).click()
  await page.getByRole('button', { name: 'Slide into the booth' }).click()
  await expect(page.getByRole('group', { name: 'Tic-Tac-Toe board' })).toBeVisible()
}

for (const view of ['3D', 'flat'] as const) {
  test(`a Classic game against the AI plays marks on both sides (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('tab', { name: 'Board games' }).click()
    await page.getByRole('option', { name: /Tic-Tac-Toe/ }).click()
    await page.getByRole('button', { name: 'Play Tic-Tac-Toe' }).click()
    await expect(page.getByRole('button', { name: /^Skip Dawson/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Slide into the booth' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-table3d', view === '3D' ? 'on' : 'off')

    // Once the grid's drawn, all nine squares are open, and Skip says hello.
    await expect(openSquares(page)).toHaveCount(9)
    await expect(page.locator('.tt-talk__bubble')).toContainText('Skip Dawson says:')

    for (let move = 1; move <= 2; move++) {
      await expect(status(page)).toHaveText('Your turn', { timeout: 10_000 })
      await openSquares(page).first().click()
      // The mark draws itself in.
      await expect(page.locator('.tt-mark[data-draw]').first()).toBeAttached()
      await expect(log(page).getByText(/^You put an X in the .+\.$/)).toHaveCount(move)
      await expect(log(page).getByText(/^Skip Dawson puts an O in the .+\.$/)).toHaveCount(move, { timeout: 10_000 })
    }
    await expect(page.getByRole('button', { name: /, X$/ })).toHaveCount(2)
    await expect(page.getByRole('button', { name: /, O$/ })).toHaveCount(2)
    expect(errors).toEqual([])
  })
}

test('an Ultimate game sends each player to the matching grid', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page, 'Ultimate')
  await expect(openSquares(page)).toHaveCount(81)
  // The top right square of the center grid sends Skip to the top right grid.
  await page.getByRole('button', { name: 'Center grid, top right, you can play here' }).click()
  await expect(log(page).getByText('You put an X in the top right of the center grid.')).toBeVisible()
  const skip = log(page).getByText(/^Skip Dawson puts an O in the .+ of the top right grid\.$/)
  await expect(skip).toBeVisible({ timeout: 10_000 })

  // Now it's you who's sent somewhere: every open square is in one grid, and it's highlighted.
  await expect(status(page)).toHaveText('Your turn', { timeout: 10_000 })
  const forced = page.locator('.tt-grid[data-status="forced"]')
  await expect(forced).toHaveCount(1)
  const open = await openSquares(page).count()
  expect(open).toBeGreaterThan(0)
  await expect(forced.getByRole('button', { name: /you can play here/ })).toHaveCount(open)
  // A number key plays the square of that grid: 5 is its center.
  await page.keyboard.press('5')
  await expect(log(page).getByText(/^You put an X in the center of the .+ grid\.$/)).toBeVisible()
  expect(errors).toEqual([])
})

test('the keyboard plays squares as on a number pad, and with the arrow keys', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page)
  await expect(openSquares(page)).toHaveCount(9)
  await page.keyboard.press('7')
  await expect(log(page).getByText('You put an X in the top left.')).toBeVisible()

  // Wait for Skip, then walk the cursor to an open square and press Enter.
  await expect(status(page)).toHaveText('Your turn', { timeout: 10_000 })
  await page.keyboard.press('ArrowRight')
  const cursor = page.locator('.tt-cell.is-cursor')
  await expect(cursor).toHaveCount(1)
  const target = Number(await openSquares(page).first().getAttribute('data-square'))
  for (let i = 0; i < 9 && Number(await cursor.getAttribute('data-square')) !== target; i++) {
    const at = Number(await cursor.getAttribute('data-square'))
    if (Math.floor(at / 3) < Math.floor(target / 3)) await page.keyboard.press('ArrowDown')
    else if (Math.floor(at / 3) > Math.floor(target / 3)) await page.keyboard.press('ArrowUp')
    else await page.keyboard.press(at % 3 < target % 3 ? 'ArrowRight' : 'ArrowLeft')
  }
  await page.keyboard.press('Enter')
  await expect(log(page).getByText(/^You put an X/)).toHaveCount(2)
  expect(errors).toEqual([])
})

test('hot-seat passes the pencil, and the marks swap for the next game', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/tictactoe')
  await page.getByRole('tab', { name: 'Hot-seat' }).click()
  await page.getByLabel('X in the first game').fill('Ada')
  await page.getByLabel('O in the first game').fill('Ben')
  await page.getByRole('button', { name: 'Start the game' }).click()

  await expect(status(page)).toHaveText('Ada to play')
  // Ada takes the top row while Ben plays the middle one.
  for (const [square, next] of [[0, 'Ben'], [3, 'Ada'], [1, 'Ben'], [4, 'Ada']] as const) {
    await expect(openSquares(page).first()).toBeVisible()
    await page.locator(`[data-square="${square}"]`).click()
    await expect(status(page)).toHaveText(`${next} to play`)
  }
  await page.locator('[data-square="2"]').click()
  const over = page.getByRole('dialog', { name: 'Ada wins' })
  await expect(over).toBeVisible()
  await expect(over).toContainText('Three in a row across the top.')
  await expect(over).toContainText('Ada 1 · Ben 0')
  // Nobody is thinking; both plates belong to people.
  await expect(page.locator('.tt-portrait')).toHaveCount(0)

  // The next game, Ben has X and goes first.
  await over.getByRole('button', { name: 'Play again' }).click()
  await expect(status(page)).toHaveText('Ben to play')
  await expect(log(page).getByText('New game of Classic. Ben plays X and goes first.')).toBeVisible()
  expect(errors).toEqual([])
})

test('a whole game against Skip goes on the record', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = watchErrors(page)
  await sitDown(page)
  const over = page.getByRole('dialog', { name: /win|Cat’s game/ })
  // Take the first open square every time it's our move, until the game ends.
  await expect(async () => {
    if (await over.isVisible()) return
    const square = openSquares(page).first()
    if ((await status(page).textContent()) === 'Your turn' && (await square.count())) await square.click({ timeout: 500 })
    await expect(over).toBeVisible({ timeout: 200 })
  }).toPass({ timeout: 50_000, intervals: [100] })

  await expect(over.locator('.tt-gameover__series')).toHaveText(/^You \d · Skip Dawson \d/)
  await over.getByRole('button', { name: 'Look at the board' }).click()
  await expect(status(page)).toHaveText('Game over')
  await page.getByRole('button', { name: 'Leave table' }).click()
  await page.getByRole('link', { name: 'Back to the hub' }).click()
  await page.getByRole('link', { name: 'Records' }).click()
  await expect(page.getByRole('row', { name: /Tic-Tac-Toe/ }).getByRole('cell').first()).toHaveText('1')
  expect(errors).toEqual([])
})

test('leaving a game against the AI early counts as a loss', async ({ page }) => {
  await sitDown(page)
  await openSquares(page).first().click()
  await page.getByRole('button', { name: 'Leave table' }).click()
  await page.getByRole('button', { name: 'Resign the game' }).click()
  await expect(page.getByRole('button', { name: 'Slide into the booth' })).toBeVisible()
  await page.goto('/#/records')
  await expect(page.getByRole('row', { name: /Tic-Tac-Toe/ }).getByRole('cell').nth(2)).toHaveText('1')
})

test('the top of the ladder is honest about Classic', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('atomic-hub-save')) return
    localStorage.setItem('atomic-hub-save', JSON.stringify({ version: 1, state: { tictactoe: { variant: 'classic', beaten: { skip: 1, bev: 1, gus: 1 } } } }))
  })
  await page.goto('/#/tictactoe')
  await expect(page.getByRole('button', { name: /^Ambrose Whitlock/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Nobody beats perfect play at Classic.', { exact: false })).toBeVisible()
  await page.getByText('Ultimate', { exact: true }).click()
  await expect(page.getByText('Nobody beats perfect play at Classic.', { exact: false })).toHaveCount(0)
})

test('two players play Tic-Tac-Toe online, and the marks swap for the next game', async ({ browser }) => {
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'tictactoe', 'Hostess')
  await joinTable(guest, 'tictactoe', code, 'Guesty')

  await expect(host.getByRole('list', { name: 'Players' })).toContainText('Guesty')
  await host.getByLabel('X, moves first').check()
  await host.getByRole('button', { name: 'Start' }).click()

  for (const page of [host, guest]) await expect(page.getByRole('group', { name: 'Tic-Tac-Toe board' })).toBeVisible()
  await expect(status(host)).toHaveText('Your turn')
  await expect(status(guest)).toHaveText('Hostess to play')
  await expect(openSquares(guest)).toHaveCount(0)

  // The host takes the top row while the guest plays the middle one; each mark turns up on the other board.
  for (const [page, other, square] of [[host, guest, 0], [guest, host, 3], [host, guest, 1], [guest, host, 4]] as const) {
    await expect(openSquares(page).first()).toBeVisible()
    await page.locator(`[data-square="${square}"]`).click()
    await expect(other.locator(`[data-square="${square}"]`)).toHaveAttribute('aria-label', /, [XO]$/)
  }
  await expect(host.getByRole('list', { name: 'Move log' })).toContainText('Guesty puts an O in the center.')
  await host.locator('[data-square="2"]').click()
  await expect(host.getByRole('dialog', { name: 'You win' })).toBeVisible({ timeout: 10_000 })
  await expect(guest.getByRole('dialog', { name: 'Hostess wins' })).toBeVisible({ timeout: 10_000 })

  // Play again: the guest has X now and goes first.
  await guest.getByRole('dialog').getByRole('button', { name: 'Play again' }).click()
  await expect(status(guest)).toHaveText('Your turn', { timeout: 10_000 })
  await expect(status(host)).toHaveText('Guesty to play')

  // The guest gets up mid-game: that's a resignation.
  await guest.getByRole('button', { name: 'Leave table' }).click()
  await guest.getByRole('button', { name: 'Resign the game' }).click()
  await expect(guest).toHaveURL(/#\/tictactoe$/)
  await expect(host.getByRole('dialog').getByRole('heading', { name: 'You win' })).toBeVisible({ timeout: 10_000 })
  await expect(host.getByText('Guesty resigned.')).toBeVisible()

  expect(errors.flat()).toEqual([])
  await context.close()
})
