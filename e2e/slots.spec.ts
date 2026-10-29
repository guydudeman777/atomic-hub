import { type Page, expect, test } from '@playwright/test'
import { hostTable, joinTable, skipBoot, twoPlayers, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

// The reels stop two seconds after the pull; a big win takes a few more to count up.
const SPIN = 8000

const yours = (page: Page) => page.getByRole('region', { name: /^Your machine/ })
const meter = (page: Page, label: string) => yours(page).locator('.sl-meter').filter({ hasText: label }).locator('.sl-digits')
const log = (page: Page) => page.getByRole('list', { name: 'Machine log' })
const status = (page: Page) => page.locator('.sl-hud__status')
/** Your pulls in the log: "Three coins: bell, cherry, blank." */
const pulls = (page: Page) => log(page).getByText(/^(One|Two|Three) coins?: /)

/** Sit down at a machine, Bottle Caps unless told otherwise. */
async function sitDown(page: Page, machine = 'Bottle Caps') {
  await page.goto('/#/slots')
  await page.getByRole('radio', { name: new RegExp(`^${machine}`) }).click()
  await page.getByRole('button', { name: 'Sit down' }).click()
  await expect(yours(page)).toBeVisible()
}

/** Pull, and wait for your reels to stop. Returns the line, as the log reads it. */
async function pull(page: Page, how: () => Promise<void> = () => page.getByRole('button', { name: /^Spin/ }).click()) {
  const before = await pulls(page).count()
  await how()
  await expect(status(page)).toHaveText('Reels turning')
  await expect(pulls(page)).toHaveCount(before + 1, { timeout: SPIN })
  const text = (await pulls(page).nth(before).textContent())!
  return text.replace(/^\w+ coins?: /, '').replace(/\.$/, '').split(', ')
}

/** What Bottle Caps pays a coin for a line, from its glass. */
function bottleCaps(line: string[]): number {
  const three: Record<string, number> = { 'bottle cap': 500, bell: 100, cherry: 50, horseshoe: 40, 'tin can': 25 }
  if (line[0] === line[1] && line[1] === line[2] && three[line[0]]) return three[line[0]]
  if (line.every((s) => ['bottle cap', 'bell', 'horseshoe', 'tin can'].includes(s))) return 5
  const cherries = line.filter((s) => s === 'cherry').length
  return cherries >= 2 ? 5 : cherries === 1 ? 2 : 0
}

for (const view of ['3D', 'flat'] as const) {
  test(`a pull pays what the glass says and goes on the record (${view} view)`, async ({ page }) => {
    test.setTimeout(60_000)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('tab', { name: 'Casino floor' }).click()
    await page.getByRole('option', { name: /Slots/ }).click()
    await page.getByRole('button', { name: 'Play Slots' }).click()
    await expect(page.getByRole('radio', { name: /^Bottle Caps/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Sit down' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-table3d', view === '3D' ? 'on' : 'off')

    // Dottie says hello, and you have the row to yourself.
    await expect(page.locator('.sl-talk--attendant .sl-talk__bubble')).toContainText('Dottie says:')
    await expect(page.locator('.sl-cabinet')).toHaveCount(1)
    await expect(status(page)).toHaveText('Pull the handle')
    await expect(meter(page, 'Credits')).toHaveText('500')

    // Three coins in: the bet meter says so, and the column on the glass lights.
    await page.keyboard.press('3')
    await expect(meter(page, 'Bet')).toHaveText('3')
    await expect(yours(page).locator('.sl-glass__row--head [data-current]')).toHaveText('3 coins')

    const line = await pull(page)
    // The window shows what the log says is on the line.
    await expect(yours(page).getByRole('img', { name: `On the line: ${line.join(', ')}.` })).toBeVisible()
    const won = bottleCaps(line) * 3
    if (won) {
      await expect(status(page)).toHaveText(`Winner: ${won} caps`)
      await expect(meter(page, 'Winner paid')).toHaveText(String(won), { timeout: SPIN })
      await expect(yours(page).locator('.sl-glass__row[data-lit]')).toHaveCount(1)
    } else {
      await expect(status(page)).toHaveText('No win')
    }
    await expect(meter(page, 'Credits')).toHaveText(String(497 + won), { timeout: SPIN })

    // The pull is on the record, and the caps went with you.
    await page.getByRole('button', { name: 'Leave machine' }).click()
    await expect(page.locator('.sl-caps')).toHaveText(`${497 + won} caps`)
    await page.getByRole('link', { name: 'Back to the hub' }).click()
    await page.getByRole('link', { name: 'Records' }).click()
    await expect(page.getByRole('row', { name: /Slots/ }).getByRole('cell').first()).toHaveText('1')
    expect(errors).toEqual([])
  })
}

test('Bet one, Bet max, the handle and the keys', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = watchErrors(page)
  await sitDown(page, 'Atomic Sevens')
  await expect(meter(page, 'Credits')).toHaveText('100')
  // Bet one goes round from one coin to three and back.
  const betOne = page.getByRole('button', { name: 'Bet one' })
  for (const coins of ['2', '3', '1']) {
    await betOne.click()
    await expect(meter(page, 'Bet')).toHaveText(coins)
  }
  await page.keyboard.press('2')
  await expect(meter(page, 'Bet')).toHaveText('2')
  await expect(page.locator('.sl-hud__help')).toContainText('93.99% on two coins, and 95.01% on three')

  // The handle pulls two coins' worth.
  await pull(page, () => page.getByRole('button', { name: 'Pull the handle' }).click())
  await expect(pulls(page).last()).toHaveText(/^Two coins: /)
  // Bet max puts three in and pulls.
  await pull(page, () => page.getByRole('button', { name: 'Bet max' }).click())
  await expect(meter(page, 'Bet')).toHaveText('3')
  await expect(pulls(page).last()).toHaveText(/^Three coins: /)
  // S pulls again; B adds a coin, round to one.
  await pull(page, () => page.keyboard.press('s'))
  await page.keyboard.press('b')
  await expect(meter(page, 'Bet')).toHaveText('1')
  expect(errors).toEqual([])
})

test('Moon Rocket’s meter climbs with three-coin pulls, and is there next time', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = watchErrors(page)
  await sitDown(page, 'Moon Rocket')
  const marquee = yours(page).locator('.sl-digits--meter')
  const caps = async () => Number((await marquee.textContent())!.replace(/\D/g, ''))
  await expect(marquee).toHaveText(/^100,0\d\d$/)
  await expect(page.locator('.sl-hud__help')).toContainText('The meter’s at 100,0')
  const start = await caps()
  await pull(page, () => page.getByRole('button', { name: 'Bet max' }).click())
  // 1.5 caps a three-coin pull, unless it hit.
  const after = await caps()
  expect(after === 100_000 || after > start).toBe(true)
  await page.getByRole('button', { name: 'Leave machine' }).click()
  // Saved where you left it.
  const card = page.getByRole('radio', { name: /^Moon Rocket/ })
  await expect(card).toContainText(/The meter’s at [\d,]+ caps/)
  const saved = Number((await card.textContent())!.match(/The meter’s at ([\d,]+) caps/)![1].replace(/,/g, ''))
  expect(saved).toBe(after)
  await page.getByRole('button', { name: 'Sit down' }).click()
  expect(await caps()).toBe(saved)
  expect(errors).toEqual([])
})

test('the whole machine fits a laptop’s window, buttons and all', async ({ page }) => {
  // The tallest two: their glass has the most lines and a note under it.
  for (const machine of ['Moon Rocket', 'Atomic Sevens']) {
    await sitDown(page, machine)
    for (const [width, height] of [[1366, 650], [1280, 720], [1366, 768], [1024, 600], [1440, 900]]) {
      await page.setViewportSize({ width, height })
      await expect(async () => {
        const deck = (await yours(page).locator('.sl-deck').boundingBox())!
        expect(deck.y + deck.height).toBeLessThanOrEqual(height)
      }, `${machine} at ${width}×${height}`).toPass({ timeout: 2000 })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Leave machine' }).click()
  }
})

test('the paytables show every machine’s lines, odds and return', async ({ page }) => {
  await page.goto('/#/slots/pays')
  const machine = (name: string) => page.getByRole('region', { name: new RegExp(`^${name}`) })
  const row = (name: string, line: string) => machine(name).getByRole('row', { name: new RegExp(`^${line}`) }).getByRole('cell')
  await expect(row('Bottle Caps', 'Three bottle caps')).toHaveText(['500', '1,000', '1,500', '1 in 32,768', '1.53%'])
  await expect(row('Bottle Caps', 'Pays back')).toHaveText(['94.96%', '94.96%', '94.96%', '', '94.96%'])
  await expect(row('Atomic Sevens', 'Three atoms')).toHaveText(['1,000', '2,000', '4,000', '1 in 32,768', '4.07%'])
  await expect(row('Atomic Sevens', 'Pays back')).toHaveText(['93.99%', '93.99%', '95.01%', '', '95.01%'])
  await expect(row('Moon Rocket', 'Three rockets')).toHaveText(['1,000', '2,000', 'Jackpot', '1 in 32,768', '4.07%'])
  await expect(row('Moon Rocket', 'To the meter')).toHaveText(['', '2.00%'])
  await expect(row('Moon Rocket', 'Pays back')).toHaveText(['92.05%', '92.05%', '95.07%', '', '95.07%'])
  // The reel strips, stop by stop.
  await machine('Bottle Caps').getByText('The reel strips').click()
  await expect(machine('Bottle Caps').getByRole('list', { name: 'Reel 1' }).getByRole('listitem')).toHaveCount(22)
})

test('two friends side by side online: everyone’s reels, and one meter for the row', async ({ browser }) => {
  test.setTimeout(90_000)
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'slots', 'Hostess')
  await joinTable(guest, 'slots', code, 'Guesty')
  await expect(host.getByRole('list', { name: 'Players' })).toContainText('Guesty')
  await host.getByLabel('Machines').selectOption('rocket')
  await host.getByRole('button', { name: 'Start' }).click()
  for (const page of [host, guest]) await expect(yours(page)).toHaveAttribute('data-machine', 'rocket')
  // The friend next door, and an open machine.
  await expect(host.locator('.sl-plate:not(.is-empty)')).toHaveText(/Guesty/)
  await expect(guest.locator('.sl-plate:not(.is-empty)')).toHaveText(/Hostess/)

  // The guest pulls three coins; the host sees it on the machine beside theirs.
  const line = await pull(guest, () => guest.getByRole('button', { name: 'Bet max' }).click())
  await expect(host.locator('.sl-cabinet.is-neighbor:not(.is-empty)').getByRole('img', { name: `On the line: ${line.join(', ')}.` })).toBeVisible({ timeout: SPIN })
  await expect(host.locator('.sl-plate.is-player .sl-plate__coins [data-on]')).toHaveCount(3)

  // The host pulls too; both rows' meters agree.
  await pull(host, () => host.getByRole('button', { name: 'Bet max' }).click())
  const shown = (page: Page) => yours(page).locator('.sl-digits--meter').textContent()
  await expect(async () => expect(await shown(guest)).toBe(await shown(host))).toPass({ timeout: SPIN })
  expect(errors.flat()).toEqual([])
  await context.close()
})
