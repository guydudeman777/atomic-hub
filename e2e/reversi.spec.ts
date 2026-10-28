import { type Page, expect, test } from '@playwright/test'
import { skipBoot, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

const legalSquares = (page: Page) => page.getByRole('button', { name: /you can play here/ })

/** Sit down against the first opponent on the ladder, playing Black. */
async function sitDown(page: Page) {
  await page.goto('/#/reversi')
  await page.getByRole('button', { name: 'Sit down' }).click()
  await expect(page.getByRole('group', { name: 'Reversi board' })).toBeVisible()
}

for (const view of ['3D', 'flat'] as const) {
  test(`a Reversi game against the AI plays and turns discs (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('tab', { name: 'Board games' }).click()
    await page.getByRole('option', { name: /Reversi/ }).click()
    await page.getByRole('button', { name: 'Play Reversi' }).click()
    await expect(page.getByRole('button', { name: /^Buddy Novak/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Sit down' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-table3d', view === '3D' ? 'on' : 'off')

    // Four discs in the middle, Black to move with four squares open, and a hello from Buddy.
    await expect(page.locator('.rv-disc')).toHaveCount(4)
    await expect(legalSquares(page)).toHaveCount(4)
    await expect(page.locator('.rv-talk__bubble')).toContainText('Buddy Novak says:')

    const log = page.getByRole('list', { name: 'Move log' })
    const status = page.locator('.rv-hud__status')
    for (let move = 1; move <= 3; move++) {
      await expect(status).toHaveText('Your turn', { timeout: 10_000 })
      await legalSquares(page).first().click()
      // The disc lands and the ones it flanks turn over.
      await expect(page.locator('.rv-disc[data-anim="flip"]').first()).toBeAttached()
      await expect(log.getByText(/^You play [a-h][1-8], turning \d+ discs?\.$/)).toHaveCount(move)
      await expect(log.getByText(/^Buddy Novak (plays|has no move)/)).toHaveCount(move, { timeout: 10_000 })
    }
    // Every disc on the board is counted on the plates.
    const discs = await page.locator('.rv-disc').count()
    const black = Number(await page.locator('.rv-bar--bottom .rv-bar__number').textContent())
    const white = Number(await page.locator('.rv-bar--top .rv-bar__number').textContent())
    expect(black + white).toBe(discs)
    expect(errors).toEqual([])
  })
}

test('the keyboard plays squares by name and with the arrow keys', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page)
  await page.keyboard.press('d')
  await page.keyboard.press('3')
  const log = page.getByRole('list', { name: 'Move log' })
  await expect(log.getByText('You play d3, turning 1 disc.')).toBeVisible()

  // Wait for Buddy, then walk the cursor to an open square and press Enter.
  await expect(page.locator('.rv-hud__status')).toHaveText('Your turn', { timeout: 10_000 })
  await page.keyboard.press('ArrowRight')
  const cursor = page.locator('.rv-square.is-cursor')
  await expect(cursor).toHaveCount(1)
  const open = (await legalSquares(page).first().getAttribute('data-square'))!
  for (let i = 0; i < 64 && (await cursor.getAttribute('data-square')) !== open; i++) {
    const at = Number(await cursor.getAttribute('data-square'))
    const target = Number(open)
    if (at >> 3 < target >> 3) await page.keyboard.press('ArrowDown')
    else if (at >> 3 > target >> 3) await page.keyboard.press('ArrowUp')
    else await page.keyboard.press(at % 8 < target % 8 ? 'ArrowRight' : 'ArrowLeft')
  }
  await page.keyboard.press('Enter')
  await expect(log.getByText(/^You play/)).toHaveCount(2)
  expect(errors).toEqual([])
})

test('hot-seat hands the board back and forth', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/reversi')
  await page.getByRole('tab', { name: 'Hot-seat' }).click()
  await page.getByLabel('Black, moves first').fill('Ada')
  await page.getByLabel('White').fill('Ben')
  await page.getByRole('button', { name: 'Start the game' }).click()

  const status = page.locator('.rv-hud__status')
  await expect(status).toHaveText('Ada to play')
  await legalSquares(page).first().click()
  await expect(status).toHaveText('Ben to play')
  await legalSquares(page).first().click()
  await expect(status).toHaveText('Ada to play')
  const log = page.getByRole('list', { name: 'Move log' })
  await expect(log.getByText(/^Ada plays/)).toHaveCount(1)
  await expect(log.getByText(/^Ben plays/)).toHaveCount(1)
  // Nobody is thinking; both plates belong to people.
  await expect(page.locator('.rv-portrait')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a whole game against Buddy goes on the record', async ({ page }) => {
  test.setTimeout(150_000)
  const errors = watchErrors(page)
  await sitDown(page)
  const over = page.getByRole('dialog', { name: /win|A draw/ })
  // Take the first open square every time it's our move, until the game ends.
  await expect(async () => {
    if (await over.isVisible()) return
    const square = legalSquares(page).first()
    if ((await page.locator('.rv-hud__status').textContent()) === 'Your turn' && (await square.count())) await square.click({ timeout: 500 })
    await expect(over).toBeVisible({ timeout: 200 })
  }).toPass({ timeout: 140_000, intervals: [100] })

  await expect(over.locator('.rv-gameover__score')).toHaveText(/\d+\s*–\s*\d+/)
  await over.getByRole('button', { name: 'Look at the board' }).click()
  await expect(page.locator('.rv-hud__status')).toHaveText('Game over')
  await page.getByRole('button', { name: 'Leave table' }).click()
  await page.getByRole('link', { name: 'Back to the hub' }).click()
  await page.getByRole('link', { name: 'Records' }).click()
  await expect(page.getByRole('row', { name: /Reversi/ }).getByRole('cell').first()).toHaveText('1')
  expect(errors).toEqual([])
})

test('leaving a game against the AI early counts as a loss', async ({ page }) => {
  await sitDown(page)
  await legalSquares(page).first().click()
  await page.getByRole('button', { name: 'Leave table' }).click()
  await page.getByRole('button', { name: 'Resign the game' }).click()
  await expect(page.getByRole('button', { name: 'Sit down' })).toBeVisible()
  await page.goto('/#/records')
  await expect(page.getByRole('row', { name: /Reversi/ }).getByRole('cell').nth(2)).toHaveText('1')
})
