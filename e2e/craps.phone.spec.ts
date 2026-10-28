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

const zone = (page: Page, spot: string) => page.locator(`.cr-zone[data-spot="${spot}"]`)

async function stepUp(page: Page) {
  await page.goto('/#/craps')
  await page.getByRole('button', { name: 'Step up to the rail' }).tap()
  await expect(page.getByRole('region', { name: 'Craps layout' })).toBeVisible()
  // Let the table finish sitting down before measuring it.
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
}

// The dice decide how long a hand runs, so tests that roll until something happens get longer.
const ROLLING = 120_000

/**
 * Tap Roll until the pass line is decided. The log is behind the Menu on a
 * phone, so watch the status: once the dice have rolled, it reads Coming out
 * again only when the pass line has been decided, one way or the other.
 */
async function rollUntilDecided(page: Page) {
  const roll = page.getByRole('button', { name: /^Roll/ })
  const status = page.locator('.cr-hud__status')
  await expect(async () => {
    const rolled = (await page.locator('.cr-hud__rolls li, .cr-die').count()) > 0
    if (rolled && (await status.textContent()) === 'Coming out') return
    if (await roll.isEnabled({ timeout: 100 }).catch(() => false)) await roll.tap({ timeout: 500 }).catch(() => {})
    expect(rolled).toBe(true)
    await expect(status).toHaveText('Coming out', { timeout: 1500 })
  }).toPass({ timeout: 100_000, intervals: [400, 700, 1000] })
  await expect(page.getByRole('list', { name: 'Table log' })).toHaveCount(0)
}

for (const view of ['3D', 'flat'] as const) {
  test(`the Craps layout fits a phone held upright and plays by tap (${view} view)`, async ({ page }) => {
    test.setTimeout(ROLLING)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await stepUp(page)

    // Upright, the layout is the tall column and fills the width.
    const felt = page.locator('.cr-felt')
    await expect(felt).toHaveAttribute('data-shape', 'tall')
    const box = await felt.boundingBox()
    expect(box!.width).toBeGreaterThan(page.viewportSize()!.width * 0.85)

    // Every bet, the stickman, the rail and the HUD are on screen, and the bets are big enough to tap.
    for (const z of await page.locator('.cr-zone').all()) {
      await expectOnScreen(page, z)
      expect((await z.boundingBox())!.height).toBeGreaterThanOrEqual(view === '3D' ? 30 : 32)
    }
    await expectOnScreen(page, page.locator('.cr-stick-bar'))
    await expectOnScreen(page, page.locator('.cr-controls'))
    await expectOnScreen(page, page.locator('.cr-hud'))
    await expectOnScreen(page, page.locator('.cr-talk__bubble'))

    // Each tap lands on the bet tapped, even as the guide's hint changes under the felt.
    await zone(page, 'pass').tap()
    await expect(page.locator('.cr-hud__stake')).toHaveText('On the layout 5')
    await zone(page, 'field').tap()
    await zone(page, 'place-8').tap()
    await expect(page.locator('.cr-hud__stake')).toHaveText('On the layout 16')
    await expect(page.locator('.cr-stack')).toHaveCount(3)

    await rollUntilDecided(page)

    // The log and table controls wait behind the Menu.
    await page.getByRole('button', { name: 'Menu' }).tap()
    const menu = page.getByRole('dialog', { name: 'Table menu' })
    await expect(menu.getByRole('list', { name: 'Table log' }).getByText(/^Pass line (wins|loses)/).first()).toBeVisible()
    await expect(menu.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', view === '3D' ? 'true' : 'false')
    await menu.getByRole('button', { name: 'Back to the game' }).tap()
    await expect(menu).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test.describe('held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the wide layout sits beside the HUD, clear of your rail, and plays by tap', async ({ page }) => {
    test.setTimeout(ROLLING)
    const errors = watchErrors(page)
    await stepUp(page)
    const felt = page.locator('.cr-felt')
    await expect(felt).toHaveAttribute('data-shape', 'wide')
    const hud = page.locator('.cr-hud')
    const controls = page.locator('.cr-controls')
    for (const z of await page.locator('.cr-zone').all()) await expectOnScreen(page, z)
    await expectOnScreen(page, controls)
    await expectOnScreen(page, hud)
    const feltBox = await felt.boundingBox()
    const hudBox = await hud.boundingBox()
    const controlsBox = await controls.boundingBox()
    expect(hudBox!.x).toBeGreaterThanOrEqual(feltBox!.x + feltBox!.width - 1)
    expect(hudBox!.x).toBeGreaterThanOrEqual(controlsBox!.x + controlsBox!.width - 1)

    await zone(page, 'pass').tap()
    await expect(page.locator('.cr-hud__stake')).toHaveText('On the layout 5')
    await rollUntilDecided(page)
    expect(errors).toEqual([])
  })
})

test.describe('on the narrowest phones', () => {
  // Reduced motion, so screens are measured at rest rather than mid-transition.
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no Craps screen scrolls sideways, and the table fits', async ({ page }) => {
    const screens: [string, Locator][] = [
      ['/craps', page.getByRole('button', { name: 'Step up to the rail' })],
      ['/craps/bets', page.getByRole('heading', { name: 'Bets and odds' })],
      ['/craps/rules', page.getByRole('heading', { name: 'How to play' })],
    ]
    for (const [path, landmark] of screens) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      // Against the device width: a phone browser widens the page to fit anything wider.
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }

    await page.goto('/#/craps')
    await page.getByRole('button', { name: 'Step up to the rail' }).tap()
    await zone(page, 'pass').tap()
    await expect(page.locator('.cr-hud__stake')).toHaveText('On the layout 5')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const z of await page.locator('.cr-zone').all()) await expectOnScreen(page, z)
    await expectOnScreen(page, page.locator('.cr-controls'))
    await expectOnScreen(page, page.locator('.cr-hud'))
    await expectOnScreen(page, page.locator('.cr-talk__bubble'))
  })
})
