import { type Browser, type Page, expect } from '@playwright/test'

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

/** Two tabs of one browser, past the boot screen, each watched for errors. Online tests seat them at one table with `?net=local`. */
export async function twoPlayers(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => sessionStorage.setItem('atomic-hub:booted', '1'))
  const host = await context.newPage()
  const guest = await context.newPage()
  return { context, host, guest, errors: [watchErrors(host), watchErrors(guest)] }
}

/** Open the game's Online tab, set a name and host a table. Returns the code. */
export async function hostTable(page: Page, game: string, name: string) {
  await page.goto(`/?net=local#/${game}`)
  await page.getByRole('tab', { name: 'Online' }).click()
  await page.getByLabel('Your name at the table').fill(name)
  await page.getByRole('button', { name: 'Host a table' }).click()
  const code = (await page.locator('.net-code__value').textContent())!.replace('-', '')
  expect(code).toMatch(/^[2-9A-Z]{6}$/)
  return code
}

/** Follow the invite link, with a name set first. */
export async function joinTable(page: Page, game: string, code: string, name: string) {
  await page.goto(`/?net=local#/${game}`)
  await page.getByRole('tab', { name: 'Online' }).click()
  await page.getByLabel('Your name at the table').fill(name)
  await page.goto(`/?net=local#/${game}/join/${code}`)
  await expect(page.getByText(/Waiting for .+ to start/)).toBeVisible({ timeout: 10_000 })
}
