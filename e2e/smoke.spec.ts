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
    // The opponent says hello as the cards are dealt.
    await expect(page.locator('.cv-talk__bubble')).toContainText('Dusty Pete says:')

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

/** Deal a round and play it out, standing on everything and declining insurance. */
async function playRound(page: Page) {
  const deal = page.getByRole('button', { name: /^Deal/ })
  await expect(deal).toBeEnabled()
  await deal.click()
  await expect(deal).toBeHidden()
  await finishRound(page)
}

/** Stand and decline until the round is paid and the Deal button is back. */
async function finishRound(page: Page) {
  const deal = page.getByRole('button', { name: /^Deal/ })
  const stand = page.getByRole('button', { name: /^Stand/ })
  const decline = page.getByRole('button', { name: /^(No insurance|Play it out)/ })
  await expect(async () => {
    if (await decline.isEnabled({ timeout: 100 }).catch(() => false)) await decline.click({ timeout: 500 }).catch(() => {})
    else if (await stand.isEnabled({ timeout: 100 }).catch(() => false)) await stand.click({ timeout: 500 }).catch(() => {})
    await expect(deal).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 30_000 })
}

for (const view of ['3D', 'flat'] as const) {
  test(`a Blackjack round at a full table settles and pays out (${view} view)`, async ({ page }) => {
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('option', { name: /Blackjack/ }).click()
    await page.getByRole('button', { name: 'Play Blackjack' }).click()
    await expect(page.getByRole('radio', { name: /Full table/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Take a seat' }).click()

    // Four regulars at the felt, and the dealer greets you.
    await expect(page.locator('.bj-plate')).toHaveCount(5)
    await expect(page.locator('.bj-talk--dealer .bj-talk__bubble')).toContainText('Dot says:')
    await page.getByRole('button', { name: /Add a 5 chip/ }).click()
    await expect(page.locator('.bj-bet__amount')).toHaveText('10')

    await playRound(page)
    const log = page.getByRole('list', { name: 'Table log' })
    await expect(log.getByText(/^(You win \d+ caps|Blackjack! You win \d+ caps|You lose \d+ caps|Push)/)).toHaveCount(1)
    await expect(page.locator('.bj-hud__status')).toHaveText(/You win|You lose|Push|Blackjack/)

    // The round is on the record.
    await page.getByRole('button', { name: 'Leave table' }).click()
    await page.getByRole('link', { name: 'Back to the hub' }).click()
    await page.getByRole('link', { name: 'Records' }).click()
    await expect(page.getByRole('row', { name: /Blackjack/ }).getByRole('cell').first()).toHaveText('1')
    expect(errors).toEqual([])
  })
}

test('one on one with the dealer, with the coach pointing at a play', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/blackjack')
  await page.getByRole('radio', { name: /One on one/ }).click()
  await page.getByRole('button', { name: 'Take a seat' }).click()
  await expect(page.locator('.bj-plate')).toHaveCount(1)
  const deal = page.getByRole('button', { name: /^Deal/ })
  await deal.click()

  // Your first decision has the book's play lit up, unless a blackjack settled the round already.
  const advised = page.locator('.bj-button.is-advised')
  await expect(advised.or(deal)).toBeVisible({ timeout: 15_000 })
  if (await advised.isVisible()) await expect(page.locator('.bj-hud__help')).toContainText(/The book (says|never)/)
  await finishRound(page)
  expect(errors).toEqual([])
})

test('the Blackjack strategy chart covers every hand', async ({ page }) => {
  await page.goto('/#/blackjack/strategy')
  await expect(page.getByRole('table')).toHaveCount(3)
  await expect(page.getByRole('row', { name: /^16 / }).getByRole('cell')).toHaveText(['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'])
})
