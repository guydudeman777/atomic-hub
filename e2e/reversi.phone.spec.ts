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

const legalSquares = (page: Page) => page.getByRole('button', { name: /you can play here/ })

async function sitDown(page: Page) {
  await page.goto('/#/reversi')
  await page.getByRole('button', { name: 'Sit down' }).tap()
  await expect(page.locator('.rv-disc')).toHaveCount(4)
  // Measure the room at rest, not while it's still coming in.
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
}

/** Tap the first open square, then wait for Buddy's answer (or his pass). */
async function playByTap(page: Page, moves: number) {
  const status = page.locator('.rv-hud__status')
  const discs = page.locator('.rv-disc')
  for (let i = 0; i < moves; i++) {
    await expect(status).toHaveText('Your turn', { timeout: 10_000 })
    const before = await discs.count()
    await legalSquares(page).first().tap()
    await expect.poll(() => discs.count()).toBeGreaterThan(before)
  }
  await expect(status).toHaveText('Your turn', { timeout: 10_000 })
}

test.describe('on the narrowest phones', () => {
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no Reversi screen scrolls sideways, and the board still fits', async ({ page }) => {
    for (const [path, landmark] of [
      ['/reversi', page.getByRole('button', { name: 'Sit down' })],
      ['/reversi/rules', page.getByRole('heading', { name: 'How to play Reversi' })],
    ] as const) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }
    await page.goto('/#/reversi')
    await page.getByRole('radio', { name: 'White' }).check()
    await page.getByRole('button', { name: 'Sit down' }).tap()
    await expect(page.locator('.rv-disc')).toHaveCount(4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const part of ['.rv-board', '.rv-bar--top', '.rv-bar--bottom', '.rv-hud']) await expectOnScreen(page, page.locator(part))
    // Squares stay big enough to hit with a thumb.
    const square = await page.locator('.rv-square').first().boundingBox()
    expect(square!.width).toBeGreaterThanOrEqual(28)
  })
})

for (const view of ['3D', 'flat'] as const) {
  test(`the Reversi board fits a phone held upright and plays by tap (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await sitDown(page)

    // The board fills the width, and the plates and HUD are all on screen around it.
    const board = await page.locator('.rv-board').boundingBox()
    expect(board!.width).toBeGreaterThan(page.viewportSize()!.width * 0.85)
    for (const part of ['.rv-board', '.rv-bar--top', '.rv-bar--bottom', '.rv-hud']) await expectOnScreen(page, page.locator(part))
    await expectAbove(page.locator('.rv-bar--top'), page.locator('.rv-board'))
    await expectAbove(page.locator('.rv-board'), page.locator('.rv-bar--bottom'))

    await playByTap(page, 2)

    // The move log and table controls wait behind the Menu.
    await expect(page.getByRole('list', { name: 'Move log' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu' }).tap()
    const menu = page.getByRole('dialog', { name: 'Table menu' })
    await expect(menu.getByRole('list', { name: 'Move log' }).getByText(/^You play/)).toHaveCount(2)
    await expect(menu.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', view === '3D' ? 'true' : 'false')
    await menu.getByRole('button', { name: 'Show moves' }).tap()
    await expect(page.locator('.rv-square.is-marked')).toHaveCount(0)
    await menu.getByRole('button', { name: 'Back to the game' }).tap()
    await expect(menu).toHaveCount(0)
    // Moves still play with the marks off.
    await playByTap(page, 1)
    expect(errors).toEqual([])
  })
}

test.describe('held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the board sits beside the plates and the HUD, and plays by tap', async ({ page }) => {
    const errors = watchErrors(page)
    await sitDown(page)
    const board = page.locator('.rv-board')
    const hud = page.locator('.rv-hud')
    for (const part of ['.rv-board', '.rv-bar--top', '.rv-bar--bottom', '.rv-hud']) await expectOnScreen(page, page.locator(part))
    const boardBox = await board.boundingBox()
    const hudBox = await hud.boundingBox()
    expect(hudBox!.x).toBeGreaterThanOrEqual(boardBox!.x + boardBox!.width)
    await playByTap(page, 2)
    expect(errors).toEqual([])
  })
})

test('the Reversi board stays between the plates on any phone, either way up', async ({ page }) => {
  await sitDown(page)
  const top = page.locator('.rv-bar--top')
  const board = page.locator('.rv-board')
  const bottom = page.locator('.rv-bar--bottom')
  const hud = page.locator('.rv-hud')
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
      }, `${view} at ${width}×${height}`).toPass({ timeout: 2000 })
    }
  }
})
