import { type Page, expect, test } from '@playwright/test'
import { skipBoot, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

// The dice decide how long a hand runs, so tests that roll until something happens get longer.
const ROLLING = 120_000

const zone = (page: Page, spot: string) => page.locator(`.cr-zone[data-spot="${spot}"]`)

/** Step up to the rail at the low limit table. */
async function stepUp(page: Page) {
  await page.goto('/#/craps')
  await page.getByRole('button', { name: 'Step up to the rail' }).click()
  await expect(page.getByRole('region', { name: 'Craps layout' })).toBeVisible()
}

/**
 * Roll until the log reports a decision on a bet matching `decided`. Dice
 * are random, so this keeps rolling, however long the shooter's hand runs.
 */
async function rollUntil(page: Page, decided: RegExp, { tap = false } = {}) {
  const roll = page.getByRole('button', { name: /^Roll/ })
  const log = page.getByRole('list', { name: 'Table log' })
  await expect(async () => {
    if ((await log.getByText(decided).count()) > 0) return
    if (await roll.isEnabled({ timeout: 100 }).catch(() => false)) await (tap ? roll.tap({ timeout: 500 }) : roll.click({ timeout: 500 })).catch(() => {})
    expect(await log.getByText(decided).count()).toBeGreaterThan(0)
  }).toPass({ timeout: 100_000, intervals: [400, 600, 800, 1000] })
}

for (const view of ['3D', 'flat'] as const) {
  test(`a pass line bet rides until it’s decided, and goes on the record (${view} view)`, async ({ page }) => {
    test.setTimeout(ROLLING)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('tab', { name: 'Casino floor' }).click()
    await page.getByRole('option', { name: /Craps/ }).click()
    await page.getByRole('button', { name: 'Play Craps' }).click()
    await page.getByRole('button', { name: 'Step up to the rail' }).click()

    // The stickman says hello, three regulars line the rail beside you, one of them says hello too, and the guide lights up the pass line.
    await expect(page.locator('.cr-talk--stick .cr-talk__bubble')).toContainText('Benny says:')
    await expect(page.locator('.cr-plate')).toHaveCount(4)
    await expect(page.locator('.cr-plate.is-you')).toContainText('You500')
    await expect(page.locator('.cr-talk--seat .cr-talk__bubble')).toContainText('says:', { timeout: 8000 })
    await expect(zone(page, 'pass')).toHaveClass(/is-advised/)
    await expect(page.locator('html')).toHaveAttribute('data-table3d', view === '3D' ? 'on' : 'off')

    await zone(page, 'pass').click()
    await expect(page.locator('.cr-bet__amount')).toHaveText('5')
    await expect(page.locator('.cr-stack')).toHaveCount(1)

    await rollUntil(page, /^Pass line (wins|loses)/)
    await expect(page.locator('.cr-die')).toHaveCount(2)
    const log = page.getByRole('list', { name: 'Table log' })
    await expect(log.getByText(/^You roll \w+ and \w+: \d+/).first()).toBeVisible()

    // A pass line bet that won stays up with the point off, so it can come back; one that lost is gone.
    await page.getByRole('button', { name: 'Leave table' }).click()
    await expect(page.getByRole('button', { name: 'Step up to the rail' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to the hub' }).click()
    await page.getByRole('link', { name: 'Records' }).click()
    const played = Number(await page.getByRole('row', { name: /Craps/ }).getByRole('cell').first().textContent())
    expect(played).toBeGreaterThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

test('the shooter needs a line bet to come out, and R rolls once there is one', async ({ page }) => {
  const errors = watchErrors(page)
  await stepUp(page)
  await page.keyboard.press('r')
  await expect(page.locator('.cr-hud__help')).toContainText('needs a bet on the pass line or don’t pass')
  await expect(page.locator('.cr-die')).toHaveCount(0)

  await zone(page, 'dont-pass').click()
  await page.keyboard.press('r')
  await expect(page.locator('.cr-die')).toHaveCount(2)
  await expect(page.locator('.cr-hud__rolls li')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('a place bet is rounded to sixes, and comes down with its caps', async ({ page }) => {
  const errors = watchErrors(page)
  await stepUp(page)
  // The guide explains a bet as you point at it.
  await zone(page, 'place-6').hover()
  await expect(page.locator('.cr-hud__help')).toContainText('Place 6: pays 7 to 6, house edge 1.52%')

  await zone(page, 'place-6').click()
  await expect(page.locator('.cr-hud__help')).toContainText('goes down in sixes')
  await expect(page.locator('.cr-bet__amount')).toHaveText('6')
  await expect(zone(page, 'place-6')).toHaveAccessibleName(/6 caps on it, off this roll/)

  await page.getByRole('radio', { name: 'Take down' }).click()
  await zone(page, 'place-6').click()
  await expect(page.locator('.cr-bet__amount')).toHaveText('0')

  // Nothing was lost: the wallet is where it started.
  await page.getByRole('button', { name: 'Leave table' }).click()
  await expect(page.locator('.cr-caps')).toHaveText('500 caps')
  expect(errors).toEqual([])
})

test('a pass line bet can’t come down once there’s a point, and leaving forfeits it', async ({ page }) => {
  test.setTimeout(ROLLING)
  const errors = watchErrors(page)
  await stepUp(page)
  await zone(page, 'pass').click()
  // Roll until the point is on, with the pass line bet still up.
  const roll = page.getByRole('button', { name: /^Roll/ })
  await expect(async () => {
    if ((await page.locator('.cr-puck.is-on').count()) > 0) return
    if ((await page.locator('.cr-bet__amount').textContent()) === '0') await zone(page, 'pass').click({ timeout: 500 }).catch(() => {})
    if (await roll.isEnabled({ timeout: 100 }).catch(() => false)) await roll.click({ timeout: 500 }).catch(() => {})
    await expect(page.locator('.cr-puck.is-on')).toHaveCount(1, { timeout: 1500 })
  }).toPass({ timeout: 100_000 })

  // The guide points at the odds behind it.
  await expect(zone(page, 'pass-odds')).toHaveClass(/is-advised/)
  // The pass line reads as unavailable, but pressing it still says why. (Forced: Playwright won't press what's marked disabled.)
  await page.getByRole('radio', { name: 'Take down' }).click()
  await expect(zone(page, 'pass')).toHaveAttribute('aria-disabled', 'true')
  await zone(page, 'pass').click({ force: true })
  await expect(page.locator('.cr-hud__help')).toContainText('stays up once there’s a point')

  await page.getByRole('button', { name: 'Leave table' }).click()
  await page.getByRole('button', { name: /^Forfeit 5 caps/ }).click()
  await expect(page.locator('.cr-caps')).toHaveText(/^\d+ caps$/)
  expect(errors).toEqual([])
})

test('the bets and odds page lists every bet with its exact house edge', async ({ page }) => {
  await page.goto('/#/craps/bets')
  await expect(page.getByRole('table')).toHaveCount(4)
  await expect(page.getByRole('row', { name: /^Pass line/ })).toContainText('1.41%')
  await expect(page.getByRole('row', { name: /^Don’t pass/ })).toContainText('1.36%')
  await expect(page.getByRole('row', { name: /^Place 6 or 8/ })).toContainText('7 to 6')
  await expect(page.getByRole('row', { name: /^Odds on 6 or 8/ })).toContainText('none')
  await expect(page.getByRole('row', { name: /^Any seven/ })).toContainText('16.67%')
})
