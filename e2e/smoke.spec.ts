import { expect, test } from '@playwright/test'
import { skipBoot, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
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

for (const view of ['3D', 'flat'] as const) {
  test(`a Caravan game against the AI gets through the opening (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/#/caravan')
    await expect(page.locator('html')).toHaveAttribute('data-table3d', view === '3D' ? 'on' : 'off')
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
}

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

test('the 3D view can be switched off at the table and stays off', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/caravan')
  await page.getByRole('button', { name: 'Deal' }).click()
  const toggle = page.getByRole('button', { name: '3D view' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-table3d', 'on')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-table3d', 'off')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-table3d', 'off')
  expect(errors).toEqual([])
})

test('settings switch the phosphor color', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByLabel('Amber').check()
  await expect(page.locator('html')).toHaveAttribute('data-phosphor', 'amber')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-phosphor', 'amber')
})

test('a game that fails to load offers a way out instead of a blank page', async ({ page }) => {
  // Simulates an open tab after a redeploy replaced the game's files.
  await page.route(/CaravanApp/, (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Play Caravan' }).click()
  await expect(page.getByRole('alert')).toContainText('This screen didn’t load', { timeout: 10_000 })
  await page.getByRole('button', { name: 'Back to menu' }).click()
  await expect(page.getByRole('heading', { name: 'The Atomic Hub' })).toBeVisible()
})

test('entering and leaving a game play the screen transitions', async ({ page }) => {
  const errors = watchErrors(page)
  // Record every transition phase as it's applied to <html>.
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { phases: string[] }).phases = seen
    new MutationObserver(() => {
      const { leaving, entering } = document.documentElement.dataset
      const now = leaving ? `leaving:${leaving}` : entering ? `entering:${entering}` : null
      if (now && seen.at(-1) !== now) seen.push(now)
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-leaving', 'data-entering'] })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play Caravan' }).click()
  await expect(page.getByRole('button', { name: 'Deal' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the hub' }).click()
  await expect(page.getByRole('heading', { name: 'The Atomic Hub' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { phases: string[] }).phases))
    .toEqual(['leaving:enter-game', 'entering:enter-game', 'leaving:exit-game', 'entering:exit-game'])
  // Transitions clean up after themselves.
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
  expect(errors).toEqual([])
})

test('reduced motion swaps screens instantly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play Caravan' }).click()
  await expect(page.getByRole('button', { name: 'Deal' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-leaving')
  await expect(page.locator('html')).not.toHaveAttribute('data-entering')
})
