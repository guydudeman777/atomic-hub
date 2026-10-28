import { type Locator, type Page, expect, test } from '@playwright/test'
import { skipBoot, watchErrors } from './helpers.ts'

// Runs in the "phone" project (playwright.config.ts): a touch phone held upright, unless a test turns it.

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

const SPIN = 10_000

/** Once it settles (plates and bubbles spring in a little), the element's box lies inside the screen. */
async function expectSettledOnScreen(page: Page, locator: Locator) {
  await expect(() => expectOnScreen(page, locator)).toPass({ timeout: 3000 })
}

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

/** `a` and `b` don't overlap. */
async function expectApart(a: Locator, b: Locator) {
  const p = await a.boundingBox()
  const q = await b.boundingBox()
  if (!p || !q) throw new Error('Nothing to measure')
  const apart = p.x + p.width <= q.x + 1 || q.x + q.width <= p.x + 1 || p.y + p.height <= q.y + 1 || q.y + q.height <= p.y + 1
  expect(apart).toBe(true)
}

const spot = (page: Page, name: string) => page.locator(`[data-spot="${name}"]`).first()
const PARTS = ['.rl-felt', '.rl-wheel', '.rl-controls', '.rl-hud']

async function sitDown(page: Page) {
  await page.goto('/#/roulette')
  await page.getByRole('button', { name: 'Take a seat' }).tap()
  await expect(page.getByRole('region', { name: 'Roulette layout' })).toBeVisible()
  // Measure the room at rest, not while it's still coming in.
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
}

test.describe('on the narrowest phones', () => {
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no Roulette screen scrolls sideways, and the table still fits', async ({ page }) => {
    for (const [path, landmark] of [
      ['/roulette', page.getByRole('button', { name: 'Take a seat' })],
      ['/roulette/bets', page.getByRole('heading', { name: 'Bets and odds' })],
      ['/roulette/rules', page.getByRole('heading', { name: 'How to play Roulette' })],
    ] as const) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }
    await page.goto('/#/roulette')
    await page.getByRole('tab', { name: 'Online' }).tap()
    await expect(page.getByRole('button', { name: 'Host a table' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.getByRole('tab', { name: 'At the wheel' }).tap()

    await sitDown(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const part of [...PARTS, '.rl-seats']) await expectSettledOnScreen(page, page.locator(part))
    // Numbers stay big enough to hit with a finger: a tap opens their bets anyway.
    const cell = await spot(page, 'straight-17').boundingBox()
    expect(cell!.width).toBeGreaterThanOrEqual(20)
  })
})

for (const view of ['3D', 'flat'] as const) {
  test(`the tall layout fits a phone held upright, and takes inside bets by tap (${view} view)`, async ({ page }) => {
    test.setTimeout(60_000)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await sitDown(page)
    await expect(page.locator('.rl-felt')).toHaveAttribute('data-orientation', 'tall')
    for (const part of PARTS) await expectSettledOnScreen(page, page.locator(part))
    await expectApart(page.locator('.rl-felt'), page.locator('.rl-wheel'))
    // The layout runs down the screen: 1 2 3 across its top, zero above them.
    const one = (await spot(page, 'straight-1').boundingBox())!
    const three = (await spot(page, 'straight-3').boundingBox())!
    const zero = (await spot(page, 'straight-0').boundingBox())!
    expect(three.x).toBeGreaterThan(one.x)
    expect(Math.abs(three.y - one.y)).toBeLessThan(4)
    expect(zero.y).toBeLessThan(one.y)

    // A finger can't hit the lines: tapping a number offers every bet on it.
    await expect(page.locator('.rl-zone')).toHaveCount(0)
    await spot(page, 'straight-17').tap()
    const chooser = page.getByRole('dialog', { name: 'Bets on 17' })
    await expectOnScreen(page, chooser.locator('.rl-chooser'))
    await chooser.getByRole('button', { name: /^Split 14\/17/ }).tap()
    await expect(chooser).toHaveCount(0)
    await expect(page.locator('.rl-bet__amount')).toHaveText('5')
    await spot(page, 'straight-8').tap()
    await page.getByRole('dialog', { name: 'Bets on 8' }).getByRole('button', { name: /^Straight up/ }).tap()
    await spot(page, 'red').tap()
    await expect(page.locator('.rl-bet__amount')).toHaveText('15')
    await expect(page.locator('.rl-stack.is-mine')).toHaveCount(3)

    await page.getByRole('button', { name: /^Spin/ }).tap()
    await expect(page.locator('.rl-hud__status')).toHaveText('No more bets')
    await expect(page.locator('.rl-hud__status')).toHaveText(/^\d{1,2} (red|black|green)$/, { timeout: SPIN })
    await expect(page.locator('.rl-dolly')).toHaveCount(1)

    // The log and table controls wait behind the Menu.
    await expect(page.getByRole('list', { name: 'Table log' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu' }).tap()
    const menu = page.getByRole('dialog', { name: 'Table menu' })
    await expect(menu.getByRole('list', { name: 'Table log' }).getByText(/^The ball lands on /)).toHaveCount(1)
    await expect(menu.getByRole('button', { name: '3D view' })).toHaveAttribute('aria-pressed', view === '3D' ? 'true' : 'false')
    await menu.getByRole('button', { name: 'Back to the game' }).tap()
    await expect(menu).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('taking a bet down by tap offers only your own bets on the number', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page)
  await spot(page, 'straight-20').tap()
  await page.getByRole('dialog', { name: 'Bets on 20' }).getByRole('button', { name: /^Corner 16\/17\/19\/20/ }).tap()
  await page.getByRole('radio', { name: 'Down' }).tap()
  await spot(page, 'straight-16').tap()
  const chooser = page.getByRole('dialog', { name: 'Take down 16' })
  await expect(chooser.getByRole('button', { name: /^Corner/ })).toHaveCount(1)
  await expect(chooser.locator('.rl-chooser__bet')).toHaveCount(1)
  await chooser.getByRole('button', { name: /^Corner/ }).tap()
  await expect(page.locator('.rl-bet__amount')).toHaveText('0')
  expect(errors).toEqual([])
})

test.describe('held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the wide layout sits beside the wheel, with the HUD in a column of its own', async ({ page }) => {
    test.setTimeout(60_000)
    const errors = watchErrors(page)
    await sitDown(page)
    await expect(page.locator('.rl-felt')).toHaveAttribute('data-orientation', 'wide')
    for (const part of PARTS) await expectSettledOnScreen(page, page.locator(part))
    const felt = (await page.locator('.rl-felt').boundingBox())!
    const wheel = (await page.locator('.rl-wheel').boundingBox())!
    const hud = (await page.locator('.rl-hud').boundingBox())!
    expect(felt.x).toBeGreaterThanOrEqual(wheel.x + wheel.width - 2)
    expect(hud.x).toBeGreaterThanOrEqual(felt.x + felt.width)
    await spot(page, 'odd').tap()
    await page.getByRole('button', { name: /^Spin/ }).tap()
    await expect(page.locator('.rl-hud__status')).toHaveText(/^\d{1,2} (red|black|green)$/, { timeout: SPIN })
    expect(errors).toEqual([])
  })
})

test('the table stays on screen on any phone, either way up', async ({ page }) => {
  await sitDown(page)
  for (const view of ['3D', 'flat']) {
    if (view === 'flat') {
      await page.getByRole('button', { name: 'Menu' }).tap()
      await page.getByRole('button', { name: '3D view' }).tap()
      await page.getByRole('button', { name: 'Back to the game' }).tap()
    }
    for (const [width, height] of [[320, 568], [360, 640], [390, 664], [390, 844], [430, 932], [768, 1024], [740, 360], [863, 360]]) {
      await page.setViewportSize({ width, height })
      await expect(async () => {
        for (const part of PARTS) await expectOnScreen(page, page.locator(part))
        await expectApart(page.locator('.rl-felt'), page.locator('.rl-wheel'))
        await expectApart(page.locator('.rl-felt'), page.locator('.rl-controls'))
        await expectApart(page.locator('.rl-controls'), page.locator('.rl-hud'))
      }, `${view} at ${width}×${height}`).toPass({ timeout: 2000 })
    }
  }
})
