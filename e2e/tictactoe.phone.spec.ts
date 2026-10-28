import { type Locator, type Page, expect, test } from '@playwright/test'
import { skipBoot, watchErrors } from './helpers.ts'

// Runs in the "phone" project (playwright.config.ts): a touch phone held upright, unless a test turns it.

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

/** The element's box lies inside the screen. */
async function expectOnScreen(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  const screen = page.viewportSize()
  if (!box || !screen) throw new Error('Nothing to measure')
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(screen.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(screen.height + 1)
}

/** `upper` ends where `lower` starts or above it, so neither is drawn over the other. */
async function expectAbove(upper: Locator, lower: Locator) {
  const a = await upper.boundingBox()
  const b = await lower.boundingBox()
  if (!a || !b) throw new Error('Nothing to measure')
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + 1)
}

const openSquares = (page: Page) => page.getByRole('button', { name: /you can play here/ })
const PARTS = ['.tt-board', '.tt-bar--top', '.tt-bar--bottom', '.tt-hud']

async function sitDown(page: Page, variant: 'Classic' | 'Ultimate' = 'Classic') {
  await page.goto('/#/tictactoe')
  await page.getByText(variant, { exact: true }).tap()
  await page.getByRole('button', { name: 'Slide into the booth' }).tap()
  await expect(openSquares(page)).toHaveCount(variant === 'Classic' ? 9 : 81)
  // Measure the room at rest, not while it's still coming in.
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
}

/** Tap an open square, then wait for Skip's answer. */
async function playByTap(page: Page, moves: number) {
  const status = page.locator('.tt-hud__status')
  const marks = page.locator('.tt-cell .tt-mark:not(.tt-ghost)')
  for (let i = 0; i < moves; i++) {
    await expect(status).toHaveText('Your turn', { timeout: 10_000 })
    const before = await marks.count()
    await openSquares(page).first().tap()
    await expect.poll(() => marks.count()).toBeGreaterThan(before + 1)
  }
  await expect(status).toHaveText('Your turn', { timeout: 10_000 })
}

test.describe('on the narrowest phones', () => {
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no Tic-Tac-Toe screen scrolls sideways, and Ultimate’s squares still take a thumb', async ({ page }) => {
    for (const [path, landmark] of [
      ['/tictactoe', page.getByRole('button', { name: 'Slide into the booth' })],
      ['/tictactoe/rules', page.getByRole('heading', { name: 'How to play Tic-Tac-Toe' })],
    ] as const) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }
    for (const variant of ['Classic', 'Ultimate'] as const) {
      await sitDown(page, variant)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
      for (const part of PARTS) await expectOnScreen(page, page.locator(part))
      const square = await page.locator('.tt-cell').first().boundingBox()
      expect(square!.width, variant).toBeGreaterThanOrEqual(28)
      await page.getByRole('button', { name: 'Menu' }).tap()
      await page.getByRole('button', { name: 'Leave table' }).tap()
      await page.getByRole('button', { name: 'Resign the game' }).tap()
    }
  })
})

for (const view of ['3D', 'flat'] as const) {
  test(`the placemat fits a phone held upright and plays by tap (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await sitDown(page)

    // The board fills most of the width, and the plates and HUD are all on screen around it.
    const board = await page.locator('.tt-board').boundingBox()
    expect(board!.width).toBeGreaterThan(page.viewportSize()!.width * 0.75)
    for (const part of PARTS) await expectOnScreen(page, page.locator(part))
    await expectAbove(page.locator('.tt-bar--top'), page.locator('.tt-board'))
    await expectAbove(page.locator('.tt-board'), page.locator('.tt-bar--bottom'))

    await playByTap(page, 2)

    // The move log and table controls wait behind the Menu.
    await expect(page.getByRole('list', { name: 'Move log' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu' }).tap()
    const menu = page.getByRole('dialog', { name: 'Table menu' })
    await expect(menu.getByRole('list', { name: 'Move log' }).getByText(/^You put an X/)).toHaveCount(2)
    await expect(menu.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', view === '3D' ? 'true' : 'false')
    await menu.getByRole('button', { name: 'Back to the game' }).tap()
    await expect(menu).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('Ultimate plays by tap on a phone, in the grid you’re sent to', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page, 'Ultimate')
  await playByTap(page, 2)
  // After Skip's move you're sent to one grid (or free, if he sent you to a closed one).
  const forced = page.locator('.tt-grid[data-status="forced"]')
  if ((await forced.count()) === 1) await expect(forced.getByRole('button', { name: /you can play here/ })).toHaveCount(await openSquares(page).count())
  expect(errors).toEqual([])
})

test.describe('held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the placemat sits beside the plates and the HUD, and plays by tap', async ({ page }) => {
    const errors = watchErrors(page)
    await sitDown(page, 'Ultimate')
    for (const part of PARTS) await expectOnScreen(page, page.locator(part))
    const board = await page.locator('.tt-board').boundingBox()
    const hud = await page.locator('.tt-hud').boundingBox()
    expect(hud!.x).toBeGreaterThanOrEqual(board!.x + board!.width)
    await playByTap(page, 2)
    expect(errors).toEqual([])
  })
})

test('the placemat stays between the plates on any phone, either way up', async ({ page }) => {
  await sitDown(page, 'Ultimate')
  const top = page.locator('.tt-bar--top')
  const board = page.locator('.tt-board')
  const bottom = page.locator('.tt-bar--bottom')
  const hud = page.locator('.tt-hud')
  for (const view of ['3D', 'flat']) {
    if (view === 'flat') {
      await page.getByRole('button', { name: 'Menu' }).tap()
      await page.getByRole('button', { name: '3D view' }).tap()
      await page.getByRole('button', { name: 'Back to the game' }).tap()
    }
    for (const [width, height] of [[320, 568], [360, 640], [390, 664], [390, 844], [430, 932], [768, 1024], [740, 360], [863, 360]]) {
      await page.setViewportSize({ width, height })
      await expect(async () => {
        await expectOnScreen(page, board)
        await expectOnScreen(page, hud)
        if (width < height) {
          await expectAbove(top, board)
          await expectAbove(board, bottom)
          await expectAbove(bottom, hud)
        }
        const square = await page.locator('.tt-cell').first().boundingBox()
        expect(square!.width).toBeGreaterThanOrEqual(26)
      }, `${view} at ${width}×${height}`).toPass({ timeout: 2000 })
    }
  }
})
