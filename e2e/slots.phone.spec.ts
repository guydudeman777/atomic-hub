import { type Locator, type Page, expect, test } from '@playwright/test'
import { hostTable, joinTable, skipBoot, watchErrors } from './helpers.ts'

// Runs in the "phone" project (playwright.config.ts): a touch phone held upright, unless a test turns it.

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

const SPIN = 8000

/** Once it settles (bubbles spring in a little), the element's box lies inside the screen. */
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

const yours = (page: Page) => page.locator('.sl-cabinet.is-yours')
const neighbors = (page: Page) => page.locator('.sl-cabinet.is-neighbor .sl-plate')
const PARTS = ['.sl-cabinet.is-yours', '.sl-cabinet.is-yours .sl-handle', '.sl-cabinet.is-yours .sl-deck', '.sl-hud']
const status = (page: Page) => page.locator('.sl-hud__status')

async function sitDown(page: Page, machine = 'Bottle Caps') {
  await page.goto('/#/slots')
  await page.getByRole('radio', { name: new RegExp(`^${machine}`) }).tap()
  await page.getByRole('button', { name: 'Sit down' }).tap()
  await expect(page.getByRole('region', { name: /^Your machine/ })).toBeVisible()
  // Measure the room at rest, not while it's still coming in.
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
}

/** Neither friend's plate runs into your machine. */
async function expectNeighborsClear(page: Page) {
  for (const plate of await neighbors(page).all()) await expectApart(plate, yours(page))
}

/** Offline your machine has the row to itself. */
async function expectAlone(page: Page) {
  await expect(page.locator('.sl-cabinet.is-neighbor')).toHaveCount(0)
}

test.describe('on the narrowest phones', () => {
  test.use({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })

  test('no Slots screen scrolls sideways, and the machine still fits', async ({ page }) => {
    for (const [path, landmark] of [
      ['/slots', page.getByRole('button', { name: 'Sit down' })],
      ['/slots/pays', page.getByRole('heading', { name: 'Paytables' })],
      ['/slots/rules', page.getByRole('heading', { name: 'How to play Slots' })],
    ] as const) {
      await page.goto(`/#${path}`)
      await expect(landmark).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, path).toBeLessThanOrEqual(320)
    }
    await page.goto('/#/slots')
    await page.getByRole('tab', { name: 'Online' }).tap()
    await expect(page.getByRole('button', { name: 'Host a table' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.getByRole('tab', { name: 'On the row' }).tap()

    await sitDown(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const part of PARTS) await expectSettledOnScreen(page, page.locator(part))
    await expectAlone(page)
    // The Spin button is big enough for a thumb.
    const spin = await page.getByRole('button', { name: /^Spin/ }).boundingBox()
    expect(spin!.height).toBeGreaterThanOrEqual(28)
  })
})

for (const view of ['3D', 'flat'] as const) {
  test(`the machine fills a phone held upright and plays by tap (${view} view)`, async ({ page }) => {
    test.setTimeout(60_000)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await sitDown(page)
    for (const part of PARTS) await expectSettledOnScreen(page, page.locator(part))
    await expectAlone(page)

    await page.getByRole('button', { name: 'Bet max' }).tap()
    await expect(status(page)).toHaveText(/^(No win|Winner: \d+ caps|Top award!)$/, { timeout: SPIN })
    // The log and the rules are behind the Menu.
    await page.getByRole('button', { name: 'Menu' }).tap()
    await expect(page.getByRole('list', { name: 'Machine log' })).toContainText('Three coins:')
    await page.getByRole('button', { name: 'Rules' }).tap()
    await expect(page.getByRole('heading', { name: 'How to play Slots' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to the game' }).tap()
    expect(errors).toEqual([])
  })
}

test.describe('held sideways', () => {
  test.use({ viewport: { width: 863, height: 360 } })

  test('the glass sits beside the reels, with the HUD in a column of its own', async ({ page }) => {
    test.setTimeout(60_000)
    const errors = watchErrors(page)
    await sitDown(page, 'Moon Rocket')
    for (const part of PARTS) await expectSettledOnScreen(page, page.locator(part))
    await expectAlone(page)
    const glass = (await yours(page).locator('.sl-glass').boundingBox())!
    const reels = (await yours(page).locator('.sl-window').boundingBox())!
    const hud = (await page.locator('.sl-hud').boundingBox())!
    const cabinet = (await yours(page).boundingBox())!
    expect(reels.x).toBeGreaterThanOrEqual(glass.x + glass.width)
    expect(hud.x).toBeGreaterThanOrEqual(cabinet.x + cabinet.width)
    await page.getByRole('button', { name: 'Pull the handle' }).tap()
    await expect(status(page)).toHaveText(/^(No win|Winner: [\d,]+ caps|Top award!)$/, { timeout: SPIN })
    expect(errors).toEqual([])
  })
})

test('the machine stays on screen on any phone, either way up', async ({ page }) => {
  await sitDown(page, 'Atomic Sevens')
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
        await expectApart(yours(page), page.locator('.sl-hud'))
      }, `${view} at ${width}×${height}`).toPass({ timeout: 2000 })
    }
  }
})

test('online, your friends’ plates sit in a strip above your machine, clear of it, either way up', async ({ page }) => {
  test.setTimeout(60_000)
  const guest = await page.context().newPage()
  await skipBoot(guest)
  const errors = [watchErrors(page), watchErrors(guest)]
  const code = await hostTable(page, 'slots', 'Hostess')
  await joinTable(guest, 'slots', code, 'Guesty')
  await expect(page.getByRole('list', { name: 'Players' })).toContainText('Guesty')
  await page.getByRole('button', { name: 'Start' }).tap()
  await expect(page.getByRole('region', { name: /^Your machine/ })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
  // The friend next door, and an open machine.
  await expect(neighbors(page)).toHaveCount(2)
  await expect(page.locator('.sl-plate:not(.is-empty)')).toHaveText(/Guesty/)
  for (const [width, height] of [[412, 839], [360, 640], [863, 360]]) {
    await page.setViewportSize({ width, height })
    await expect(async () => {
      for (const part of PARTS) await expectOnScreen(page, page.locator(part))
      await expectNeighborsClear(page)
      const plate = (await neighbors(page).first().boundingBox())!
      expect(plate.y + plate.height).toBeLessThanOrEqual((await yours(page).boundingBox())!.y + 1)
    }, `${width}×${height}`).toPass({ timeout: 2000 })
  }
  expect(errors.flat()).toEqual([])
})
