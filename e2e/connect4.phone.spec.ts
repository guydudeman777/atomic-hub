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

const PARTS = ['.c4-rack', '.c4-bar--top', '.c4-bar--bottom', '.c4-hud']
const checkers = (page: Page) => page.locator('.c4-checker:not([data-anim="release"])')
const openColumns = (page: Page) => page.locator('.c4-column.is-open[aria-disabled="false"]')

async function sitDown(page: Page) {
  await page.goto('/#/connect4')
  await page.getByRole('button', { name: 'Sit down' }).tap()
  await expect(page.getByRole('group', { name: 'Connect Four rack' })).toBeVisible()
  // Measure the booth at rest, not while it's still coming in.
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
}

/** Tap the middle open column, then wait for Skeeter's answer. */
async function playByTap(page: Page, moves: number) {
  const status = page.locator('.c4-hud__status')
  for (let i = 0; i < moves; i++) {
    await expect(status).toHaveText('Your turn', { timeout: 10_000 })
    const before = await checkers(page).count()
    const open = openColumns(page)
    await open.nth(Math.floor((await open.count()) / 2)).tap()
    await expect(checkers(page)).toHaveCount(before + 2, { timeout: 10_000 })
  }
  await expect(status).toHaveText('Your turn', { timeout: 10_000 })
}

test.describe('on the narrowest phones', () => {
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no Connect Four screen scrolls sideways, and the rack still fits', async ({ page }) => {
    for (const [path, landmark] of [
      ['/connect4', page.getByRole('button', { name: 'Sit down' })],
      ['/connect4/rules', page.getByRole('heading', { name: 'How to play Connect Four' })],
    ] as const) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }
    await page.goto('/#/connect4')
    await page.getByRole('radio', { name: 'Yellow' }).check()
    await page.getByRole('button', { name: 'Sit down' }).tap()
    await expect(page.getByRole('group', { name: 'Connect Four rack' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const part of PARTS) await expectOnScreen(page, page.locator(part))
    // Columns stay wide enough to hit with a thumb.
    const col = await page.locator('.c4-column').first().boundingBox()
    expect(col!.width).toBeGreaterThanOrEqual(28)
    // Skeeter drops first when you play Yellow.
    await expect(checkers(page)).toHaveCount(1, { timeout: 10_000 })
  })
})

for (const view of ['3D', 'flat'] as const) {
  test(`the Connect Four rack fits a phone held upright and plays by tap (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await sitDown(page)

    // The rack fills the width, and the plates and HUD are all on screen around it.
    const rack = await page.locator('.c4-rack').boundingBox()
    expect(rack!.width).toBeGreaterThan(page.viewportSize()!.width * 0.85)
    for (const part of PARTS) await expectOnScreen(page, page.locator(part))
    await expectAbove(page.locator('.c4-bar--top'), page.locator('.c4-rack'))
    await expectAbove(page.locator('.c4-rack'), page.locator('.c4-bar--bottom'))

    await playByTap(page, 2)

    // The move log and table controls wait behind the Menu.
    await expect(page.getByRole('list', { name: 'Move log' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu' }).tap()
    const menu = page.getByRole('dialog', { name: 'Table menu' })
    await expect(menu.getByRole('list', { name: 'Move log' }).getByText(/^You drop/)).toHaveCount(2)
    await expect(menu.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', view === '3D' ? 'true' : 'false')
    await menu.getByRole('button', { name: 'Threats' }).tap()
    await expect(menu.getByRole('button', { name: 'Threats' })).toHaveAttribute('aria-pressed', 'true')
    await menu.getByRole('button', { name: 'Back to the game' }).tap()
    await expect(menu).toHaveCount(0)
    await expect(page.locator('.c4-hud__help')).toContainText('Rings mark the holes')
    await playByTap(page, 1)
    expect(errors).toEqual([])
  })
}

test.describe('held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the rack sits beside the plates and the HUD, and plays by tap', async ({ page }) => {
    const errors = watchErrors(page)
    await sitDown(page)
    for (const part of PARTS) await expectOnScreen(page, page.locator(part))
    const rack = await page.locator('.c4-rack').boundingBox()
    const hud = await page.locator('.c4-hud').boundingBox()
    expect(hud!.x).toBeGreaterThanOrEqual(rack!.x + rack!.width)
    await playByTap(page, 2)
    expect(errors).toEqual([])
  })
})

test('the rack stays between the plates on any phone, either way up', async ({ page }) => {
  await sitDown(page)
  const top = page.locator('.c4-bar--top')
  const rack = page.locator('.c4-rack')
  const bottom = page.locator('.c4-bar--bottom')
  const hud = page.locator('.c4-hud')
  for (const view of ['3D', 'flat']) {
    if (view === 'flat') {
      await page.getByRole('button', { name: 'Menu' }).tap()
      await page.getByRole('button', { name: '3D view' }).tap()
      await page.getByRole('button', { name: 'Back to the game' }).tap()
    }
    for (const [width, height] of [[320, 568], [360, 640], [390, 664], [390, 844], [430, 932], [768, 1024], [740, 360], [863, 360]]) {
      await page.setViewportSize({ width, height })
      await expect(async () => {
        await expectOnScreen(page, rack)
        await expectOnScreen(page, hud)
        if (width < height) {
          await expectAbove(top, rack)
          await expectAbove(rack, bottom)
          await expectAbove(bottom, hud)
        }
      }, `${view} at ${width}×${height}`).toPass({ timeout: 2000 })
    }
  }
})
