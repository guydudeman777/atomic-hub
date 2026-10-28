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

/** Play out the hand in front of you by tapping: check and call, and stand pat or take the marked draw. */
async function finishDrawHand(page: Page) {
  const next = page.getByRole('button', { name: /^Deal the next hand/ })
  const draw = page.getByRole('button', { name: /^(Draw|Stand pat)/ })
  const checkOrCall = page.locator('.dw-controls button:not([disabled])').filter({ hasText: /^(Check|Call|All in)/ })
  await expect(async () => {
    if (await draw.isVisible({ timeout: 100 }).catch(() => false)) await draw.tap({ timeout: 500 }).catch(() => {})
    else if (await checkOrCall.count()) await checkOrCall.first().tap({ timeout: 500 }).catch(() => {})
    await expect(next).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 45_000 })
}

/** Sit down at a full table and deal the first hand. */
async function sitAndDeal(page: Page) {
  await page.goto('/#/draw')
  await page.getByRole('radio', { name: /Full table/ }).tap()
  await page.getByRole('button', { name: 'Take a seat' }).tap()
  await page.getByRole('button', { name: /^Deal/ }).tap()
  // Five cards each, one at a time round the table.
  await expect(page.locator('.dw-card.is-yours')).toHaveCount(5, { timeout: 15_000 })
  // Let the deal land.
  await expect(page.locator('.dw-controls button:not([disabled])').first()).toBeVisible({ timeout: 15_000 })
}

test.describe('on the narrowest phones', () => {
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no Five-Card Draw screen scrolls sideways', async ({ page }) => {
    test.setTimeout(60_000)
    const screens: [string, Locator][] = [
      ['/draw', page.getByRole('button', { name: 'Take a seat' })],
      ['/draw/rankings', page.getByRole('heading', { name: 'Hand rankings' })],
      ['/draw/rules', page.getByRole('heading', { name: 'How to play' })],
    ]
    for (const [path, landmark] of screens) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }
    // And the table, with every chair taken.
    await sitAndDeal(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const card of await page.locator('.dw-card.is-yours').all()) await expectOnScreen(page, card)
    await expectOnScreen(page, page.locator('.dw-controls'))
  })
})

for (const view of ['3D', 'flat'] as const) {
  test(`the Five-Card Draw table fits a phone held upright and plays by tap (${view} view)`, async ({ page }) => {
    // Six players, five cards each, two rounds and a draw: a full table takes a while.
    test.setTimeout(90_000)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await sitAndDeal(page)

    // Upright, the tall table fills the room between the dealer and your rail.
    const felt = await page.locator('.dw-felt').boundingBox()
    const screen = page.viewportSize()!
    expect(felt!.height).toBeGreaterThan(screen.height * 0.45)
    expect(felt!.width).toBeGreaterThan(screen.width * 0.85)

    // Your hand, every plate, the dealer, your rail and the HUD are on screen.
    for (const card of await page.locator('.dw-card.is-yours').all()) await expectOnScreen(page, card)
    for (const plate of await page.locator('.dw-plate').all()) await expectOnScreen(page, plate)
    await expectOnScreen(page, page.locator('.dw-dealer-bar'))
    await expectOnScreen(page, page.locator('.dw-controls'))
    await expectOnScreen(page, page.locator('.dw-hud'))
    await finishDrawHand(page)

    // The log and table controls wait behind the Menu.
    await expect(page.getByRole('list', { name: 'Table log' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu' }).tap()
    const menu = page.getByRole('dialog', { name: 'Table menu' })
    await expect(menu.getByRole('list', { name: 'Table log' }).getByText(/^(You win|.+ wins) \d+/).first()).toBeVisible()
    await expect(menu.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', view === '3D' ? 'true' : 'false')
    await menu.getByRole('button', { name: 'Back to the game' }).tap()
    await expect(menu).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test.describe('at the Five-Card Draw table held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the felt sits beside the HUD, clear of your rail, and a hand plays by tap', async ({ page }) => {
    test.setTimeout(90_000)
    const errors = watchErrors(page)
    await sitAndDeal(page)
    const plate = page.locator('.dw-plate.is-you')
    const controls = page.locator('.dw-controls')
    const hud = page.locator('.dw-hud')
    await expectOnScreen(page, plate)
    await expectOnScreen(page, controls)
    await expectOnScreen(page, hud)
    for (const card of await page.locator('.dw-card.is-yours').all()) await expectOnScreen(page, card)
    const plateBox = await plate.boundingBox()
    const controlsBox = await controls.boundingBox()
    const hudBox = await hud.boundingBox()
    expect(plateBox!.y + plateBox!.height).toBeLessThanOrEqual(controlsBox!.y + 1)
    expect(hudBox!.x).toBeGreaterThanOrEqual(controlsBox!.x + controlsBox!.width)
    await finishDrawHand(page)
    expect(errors).toEqual([])
  })
})
