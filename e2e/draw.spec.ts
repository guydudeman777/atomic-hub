import { type Page, expect, test } from '@playwright/test'
import { finishDrawHand, skipBoot, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

/** Check or call until it's your draw. Nobody folds to a check, so heads up you always get there. */
async function playToTheDraw(page: Page) {
  const book = page.getByRole('button', { name: 'The book’s draw' })
  const checkOrCall = page.locator('.dw-controls button:not([disabled])').filter({ hasText: /^(Check|Call|All in)/ })
  await expect(async () => {
    if (await checkOrCall.count()) await checkOrCall.first().click({ timeout: 500 }).catch(() => {})
    await expect(book).toBeVisible({ timeout: 300 })
  }).toPass({ timeout: 30_000 })
}

for (const view of ['3D', 'flat'] as const) {
  test(`a Five-Card Draw hand plays out and goes on the record (${view} view)`, async ({ page }) => {
    // Six players, five cards each, two rounds and a draw: a full table takes a while.
    test.setTimeout(90_000)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('option', { name: /Five-Card Draw/ }).click()
    await page.getByRole('button', { name: 'Play Five-Card Draw' }).click()
    await page.getByRole('radio', { name: /Full table/ }).click()
    await page.getByRole('button', { name: 'Take a seat' }).click()

    // You and five regulars, and the dealer greets you.
    await expect(page.locator('.dw-plate')).toHaveCount(6)
    await expect(page.locator('.dw-talk--dealer .dw-talk__bubble')).toContainText('Hattie says:')
    await page.getByRole('button', { name: /^Deal/ }).click()
    // Five cards each, one at a time round the table.
    await expect(page.locator('.dw-card.is-yours')).toHaveCount(5, { timeout: 15_000 })

    await finishDrawHand(page)
    const log = page.getByRole('list', { name: 'Table log' })
    await expect(log.getByText(/^(You win|.+ wins) \d+/).first()).toBeVisible()
    await expect(page.locator('.dw-hud__status')).toHaveText(/You win|You lose|You break even|takes the pot/)

    // The hand is on the record.
    await page.getByRole('button', { name: 'Leave table' }).click()
    await page.getByRole('link', { name: 'Back to the hub' }).click()
    await page.getByRole('link', { name: 'Records' }).click()
    await expect(page.getByRole('row', { name: /Five-Card Draw/ }).getByRole('cell').first()).toHaveText('1')
    expect(errors).toEqual([])
  })
}

test('heads up, the hints mark the book’s draw, and the keys pick cards', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/draw')
  await page.getByRole('radio', { name: /Heads up/ }).click()
  await page.getByRole('button', { name: 'Take a seat' }).click()
  await expect(page.locator('.dw-plate')).toHaveCount(2)
  await page.keyboard.press('Enter')
  await playToTheDraw(page)

  // The book's cards are marked, and the terminal says why.
  await expect(page.locator('.dw-card.is-keep')).not.toHaveCount(0)
  await expect(page.locator('.dw-hud__help')).toHaveText(/^(Stand pat|Keep|Nothing)/)
  const cards = page.locator('button.dw-card')
  await expect(cards).toHaveCount(5)

  // 1 picks the first card to throw away; Backspace puts it back.
  await page.keyboard.press('1')
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /^Draw one/ })).toBeVisible()
  await page.keyboard.press('Backspace')
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'false')

  // Take the book's draw: as many cards picked as the button says.
  await page.getByRole('button', { name: 'The book’s draw' }).click()
  const picked = await page.locator('button.dw-card[aria-pressed="true"]').count()
  await expect(page.getByRole('button', { name: picked === 0 ? /^Stand pat/ : new RegExp(`^Draw ${['', 'one', 'two', 'three', 'four'][picked]}`) })).toBeVisible()
  await page.keyboard.press('d')
  const log = page.getByRole('list', { name: 'Table log' })
  await expect(log.getByText(/^You (draw|stand pat)/)).toHaveCount(1)
  // Following the book draws no comment.
  await expect(log.getByText(/^Hint:/)).toHaveCount(0)
  await finishDrawHand(page)
  expect(errors).toEqual([])
})

test('the hand rankings list every hand, best first', async ({ page }) => {
  await page.goto('/#/draw/rankings')
  const rankings = page.locator('.dw-ranking')
  await expect(rankings).toHaveCount(10)
  await expect(rankings.first()).toContainText('Royal flush')
  await expect(rankings.first()).toContainText('1 in 649,740')
  await expect(rankings.last()).toContainText('High card')
})
