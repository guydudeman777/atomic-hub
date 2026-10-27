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

async function dealAgainstTheAi(page: Page) {
  await page.goto('/#/caravan')
  await page.getByRole('button', { name: 'Deal' }).tap()
  await expect(page.locator('.cv-hud__status')).toHaveText(/Opening.*\(1 of 3\)/, { timeout: 10_000 })
  // Let the opening deal land.
  await expect(page.locator('.cv-hand.is-dealing')).toHaveCount(0)
}

/** Place a number card on each caravan by tapping, as the opening asks. */
async function playOpening(page: Page) {
  const status = page.locator('.cv-hud__status')
  for (let turn = 1; turn <= 3; turn++) {
    await expect(status).toHaveText(new RegExp(`Opening.*\\(${turn} of 3\\)`), { timeout: 10_000 })
    await page.locator('.cv-hand__card:not(.is-dim)').first().tap()
    await page.locator('.cv-caravan.is-drop').first().tap()
  }
  await expect(status).toHaveText('Your turn', { timeout: 10_000 })
}

test.describe('on the narrowest phones', () => {
  // Reduced motion, so screens are measured at rest rather than mid-transition.
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no screen scrolls sideways', async ({ page }) => {
    const screens: [string, Locator][] = [
      ['/', page.getByRole('heading', { name: 'The Atomic Hub' })],
      ['/settings', page.getByRole('heading', { name: 'Settings' })],
      ['/records', page.getByRole('heading', { name: 'Records' })],
      ['/caravan', page.getByRole('button', { name: 'Deal' })],
      ['/caravan/decks', page.getByRole('button', { name: 'Save deck' })],
      ['/caravan/trader', page.getByRole('heading', { name: 'The Trader' })],
      ['/caravan/rules', page.getByRole('heading', { name: 'How to play Caravan' })],
    ]
    for (const [path, landmark] of screens) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      // Against the device width: a phone browser widens the page to fit anything wider.
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }
  })
})

test('in the hub menu one tap picks a game and a second tap opens it', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  const blackjack = page.getByRole('option', { name: /Blackjack/ })
  await blackjack.tap()
  await expect(blackjack).toHaveAttribute('aria-selected', 'true')

  // The visible Play cue isn't part of the game's name.
  const caravan = page.getByRole('option', { name: 'Caravan', exact: true })
  await caravan.tap()
  await expect(caravan).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'The Atomic Hub' })).toBeVisible()
  await caravan.tap()
  await expect(page.getByRole('button', { name: 'Deal' })).toBeVisible()
  expect(errors).toEqual([])
})

for (const view of ['3D', 'flat'] as const) {
  test(`the Caravan table fits a phone held upright and plays by tap (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await dealAgainstTheAi(page)

    // The whole hand, both rows of caravans and the HUD are on screen.
    for (const card of await page.locator('.cv-hand__card').all()) await expectOnScreen(page, card)
    await expectOnScreen(page, page.locator('.cv-felt'))
    await expectOnScreen(page, page.locator('.cv-hud'))

    await playOpening(page)

    // The move log and table controls wait behind the Menu.
    await expect(page.getByRole('list', { name: 'Move log' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu' }).tap()
    const menu = page.getByRole('dialog', { name: 'Table menu' })
    await expect(menu.getByRole('list', { name: 'Move log' }).getByText(/^You played/)).toHaveCount(3)
    await expect(menu.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', view === '3D' ? 'true' : 'false')
    await menu.getByRole('button', { name: 'Back to the game' }).tap()
    await expect(menu).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test.describe('held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the board sits beside the HUD and the opening plays by tap', async ({ page }) => {
    const errors = watchErrors(page)
    await dealAgainstTheAi(page)

    const felt = page.locator('.cv-felt')
    const hud = page.locator('.cv-hud')
    await expectOnScreen(page, felt)
    await expectOnScreen(page, hud)
    await expectOnScreen(page, page.locator('.cv-player-bar'))
    const feltBox = await felt.boundingBox()
    const hudBox = await hud.boundingBox()
    expect(hudBox!.x).toBeGreaterThanOrEqual(feltBox!.x + feltBox!.width)

    await playOpening(page)
    expect(errors).toEqual([])
  })
})
