import { type Browser, type Page, expect, test } from '@playwright/test'
import { watchErrors } from './helpers.ts'

/**
 * Online tables, with two tabs of one browser talking over a
 * BroadcastChannel (`?net=local`) instead of the Nostr relays.
 */

async function twoPlayers(browser: Browser) {
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

test('two players play Reversi online, and a resignation ends it', async ({ browser }) => {
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'reversi', 'Hostess')
  await joinTable(guest, 'reversi', code, 'Guesty')

  await expect(host.getByRole('list', { name: 'Players' })).toContainText('Guesty')
  await host.getByLabel('Black, moves first').check()
  await host.getByRole('button', { name: 'Start' }).click()

  for (const page of [host, guest]) await expect(page.getByRole('group', { name: 'Reversi board' })).toBeVisible()
  const status = (page: Page) => page.locator('.rv-hud__status')
  const legal = (page: Page) => page.getByRole('button', { name: /you can play here/ })
  await expect(status(host)).toHaveText('Your turn')
  await expect(status(guest)).toHaveText('Hostess to play')
  await expect(legal(guest)).toHaveCount(0)

  // Black, then White, then Black again: each move turns up on the other board.
  await legal(host).first().click()
  await expect(guest.locator('.rv-disc')).toHaveCount(5)
  await expect(status(guest)).toHaveText('Your turn')
  await legal(guest).first().click()
  await expect(host.locator('.rv-disc')).toHaveCount(6)
  await expect(host.getByRole('list', { name: 'Move log' })).toContainText(/Guesty plays [a-h][1-8]/)
  await expect(guest.getByRole('list', { name: 'Move log' })).toContainText(/You play [a-h][1-8]/)
  const board = (page: Page) => page.locator('.rv-disc').evaluateAll((discs) => discs.map((d) => d.closest('[data-square]')?.getAttribute('data-square')).sort())
  expect(await board(host)).toEqual(await board(guest))

  // The guest gets up mid-game: that's a resignation.
  await guest.getByRole('button', { name: 'Leave table' }).click()
  await guest.getByRole('button', { name: 'Resign the game' }).click()
  await expect(guest).toHaveURL(/#\/reversi$/)
  await expect(host.getByRole('dialog').getByRole('heading', { name: 'You win' })).toBeVisible({ timeout: 10_000 })
  await expect(host.getByText('Guesty resigned.')).toBeVisible()

  expect(errors.flat()).toEqual([])
  await context.close()
})

test('a code nobody is hosting, or a mistyped one, says so', async ({ browser }) => {
  const { context, host } = await twoPlayers(browser)
  await host.goto('/?net=local#/reversi')
  await host.getByRole('tab', { name: 'Online' }).click()
  await host.getByLabel('Table code').fill('abc')
  await host.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByText(/A code is six letters and numbers/)).toBeVisible()
  await context.close()
})

test('the guest’s table closes when the host closes it', async ({ browser }) => {
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'reversi', 'Hostess')
  await joinTable(guest, 'reversi', code, 'Guesty')
  await host.getByRole('button', { name: 'Start' }).click()
  await expect(guest.getByRole('group', { name: 'Reversi board' })).toBeVisible()
  await host.getByRole('button', { name: 'Leave table' }).click()
  await host.getByRole('button', { name: 'Resign the game' }).click()
  await expect(guest.getByRole('alert')).toContainText('The host closed the table.')
  await guest.getByRole('button', { name: 'Back to the lobby' }).click()
  await expect(guest).toHaveURL(/#\/reversi$/)
  expect(errors.flat()).toEqual([])
  await context.close()
})
