import { type Page, expect } from '@playwright/test'

/** Collect uncaught errors and console errors; tests expect the list to stay empty. */
export function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

/** Skip the once-per-session boot text. */
export async function skipBoot(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('atomic-hub:booted', '1'))
}

/**
 * Play out the Blackjack round in front of you, standing on everything and
 * declining insurance, until it's paid and the Deal button is back. Phones tap.
 */
export async function finishBlackjackRound(page: Page, { tap = false } = {}) {
  const deal = page.getByRole('button', { name: /^Deal/ })
  const stand = page.getByRole('button', { name: /^Stand/ })
  const decline = page.getByRole('button', { name: /^(No insurance|Play it out)/ })
  const press = (button: typeof deal) => (tap ? button.tap({ timeout: 500 }) : button.click({ timeout: 500 })).catch(() => {})
  await expect(async () => {
    if (await decline.isEnabled({ timeout: 100 }).catch(() => false)) await press(decline)
    else if (await stand.isEnabled({ timeout: 100 }).catch(() => false)) await press(stand)
    await expect(deal).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 30_000 })
}

/** Play out the Five-Card Draw hand in front of you, checking and calling, standing pat or taking the marked draw. */
export async function finishDrawHand(page: Page) {
  const next = page.getByRole('button', { name: /^Deal the next hand/ })
  const draw = page.getByRole('button', { name: /^(Draw|Stand pat)/ })
  const checkOrCall = page.locator('.dw-controls button:not([disabled])').filter({ hasText: /^(Check|Call|All in)/ })
  await expect(async () => {
    if (await draw.isVisible({ timeout: 100 }).catch(() => false)) await draw.click({ timeout: 500 }).catch(() => {})
    else if (await checkOrCall.count()) await checkOrCall.first().click({ timeout: 500 }).catch(() => {})
    await expect(next).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 45_000 })
}
