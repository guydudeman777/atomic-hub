import { type Page, expect, test } from '@playwright/test'

/** Fail the test on any uncaught error or console error. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

test.beforeEach(async ({ page }) => {
  // Skip the once-per-session boot text.
  await page.addInitScript(() => sessionStorage.setItem('atomic-hub:booted', '1'))
})

test('hub menu lists the games and navigates by keyboard', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The Atomic Hub' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Caravan' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('500', { exact: true })).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: /Blackjack/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Casino floor' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: 'Card tables' }).click()
  await page.getByRole('option', { name: 'Caravan' }).click()
  await page.getByRole('button', { name: 'Play Caravan' }).click()
  await expect(page.getByRole('heading', { name: 'Caravan' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a Caravan game against the AI gets through the opening', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/caravan')
  await page.getByRole('button', { name: 'Deal' }).click()
  const status = page.locator('.cv-hud__status')

  for (let turn = 1; turn <= 3; turn++) {
    await expect(status).toHaveText(new RegExp(`Opening.*\\(${turn} of 3\\)`), { timeout: 10_000 })
    await page.locator('.cv-hand__card:not(.is-dim)').first().click()
    await page.locator('.cv-caravan.is-drop').first().click()
  }

  // The opening is over: the AI answers and normal turns begin. (Exact card
  // counts vary, since the AI may already have played a Jack on you.)
  await expect(status).toHaveText('Your turn', { timeout: 10_000 })
  const log = page.getByRole('list', { name: 'Move log' })
  await expect(log.getByText(/^You played/)).toHaveCount(3)
  await expect.poll(() => log.getByText(/^Dusty Pete played/).count()).toBeGreaterThanOrEqual(3)
  expect(errors).toEqual([])
})

test('hot-seat hides the table between turns', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/caravan')
  await page.getByRole('tab', { name: 'Hot-seat' }).click()
  await page.getByRole('button', { name: 'Deal' }).click()

  const handoff = page.getByRole('dialog')
  await expect(handoff).toContainText('Pass the device to')
  const first = (await handoff.locator('h2').textContent())?.replace('Pass the device to ', '')
  await page.getByRole('button', { name: /show my hand/ }).click()
  await page.locator('.cv-hand__card:not(.is-dim)').first().click()
  await page.locator('.cv-caravan.is-drop').first().click()

  const next = first === 'Player 1' ? 'Player 2' : 'Player 1'
  await expect(handoff).toContainText(`Pass the device to ${next}`)
  // While the dialog is up, the hand underneath is face down.
  await expect(page.getByRole('img', { name: 'Face-down card' }).first()).toBeAttached()
  expect(errors).toEqual([])
})

test('settings switch the phosphor color', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByLabel('Amber').check()
  await expect(page.locator('html')).toHaveAttribute('data-phosphor', 'amber')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-phosphor', 'amber')
})
