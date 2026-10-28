import { type Page, expect, test } from '@playwright/test'
import { hostTable, joinTable, skipBoot, twoPlayers, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await skipBoot(page)
})

// A spin takes five and a half seconds from the launch to the ball settling.
const SPIN = 10_000

const spot = (page: Page, name: string) => page.locator(`[data-spot="${name}"]`).first()
const onLayout = (page: Page) => page.locator('.rl-bet__amount')
const yourCaps = (page: Page) => page.locator('.rl-plate.is-you .rl-plate__stack')
const log = (page: Page) => page.getByRole('list', { name: 'Table log' })

/** Sit down at a wheel, at the Salon unless told otherwise. */
async function sitDown(page: Page, wheel: 'European' | 'French' | 'American' = 'European', table = 'The Salon') {
  await page.goto('/#/roulette')
  await page.getByRole('radio', { name: new RegExp(`^${wheel}`) }).click()
  await page.getByRole('radio', { name: new RegExp(`^${table}`) }).click()
  await page.getByRole('button', { name: 'Take a seat' }).click()
  await expect(page.getByRole('region', { name: 'Roulette layout' })).toBeVisible()
}

/** Spin, and wait for the ball to settle. */
async function spin(page: Page, spins = 1) {
  const lands = log(page).getByText(/^The ball lands on /)
  const before = await lands.count()
  await page.getByRole('button', { name: /^Spin/ }).click()
  await expect(page.locator('.rl-hud__status')).toHaveText('No more bets')
  await expect(lands).toHaveCount(before + spins, { timeout: SPIN })
}

for (const view of ['3D', 'flat'] as const) {
  test(`a spin settles your bets and goes on the record (${view} view)`, async ({ page }) => {
    test.setTimeout(60_000)
    const errors = watchErrors(page)
    if (view === 'flat') {
      await page.goto('/#/settings')
      await page.getByLabel('3D tables').uncheck()
    }
    await page.goto('/')
    await page.getByRole('tab', { name: 'Casino floor' }).click()
    await page.getByRole('option', { name: /Roulette/ }).click()
    await page.getByRole('button', { name: 'Play Roulette' }).click()
    await expect(page.getByRole('radio', { name: /^European/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Take a seat' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-table3d', view === '3D' ? 'on' : 'off')

    // Henri greets you, and three regulars sit in with their own chips down.
    await expect(page.locator('.rl-talk--croupier .rl-talk__bubble')).toContainText('Henri says:')
    await expect(page.locator('.rl-plate:not(.is-you, .is-empty)')).toHaveCount(3)
    await expect(page.locator('.rl-stack:not(.is-mine)').first()).toBeAttached()
    await expect(page.locator('.rl-hud__status')).toHaveText('Place your bets')

    // Five on red, five straight up on 17: 10 on the layout, 490 in front of you.
    await spot(page, 'red').click()
    await spot(page, 'straight-17').click()
    await expect(onLayout(page)).toHaveText('10')
    await expect(yourCaps(page)).toHaveText(/^490/)
    await expect(page.locator('.rl-stack.is-mine')).toHaveCount(2)

    await spin(page)
    // The croupier calls the number, the dolly goes on it, and the board lights it.
    await expect(page.locator('.rl-hud__status')).toHaveText(/^(\d{1,2}) (red|black|green)$/)
    const [, number, color] = (await page.locator('.rl-hud__status').textContent())!.match(/^(\d+) (\w+)$/)!
    await expect(page.locator('.rl-dolly')).toHaveCount(1)
    await expect(page.locator('.rl-numbers__list li').first()).toHaveText(number)
    await expect(page.locator('.rl-talk--croupier .rl-talk__bubble')).toContainText(/(Zero|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|teen|Twenty|Thirty)/)

    // What came back is what the rules pay: red even money and stays up, 17 at 35 to 1.
    const red = color === 'red'
    const hit = number === '17'
    const caps = 490 + (red ? 5 : 0) + (hit ? 175 : 0)
    await expect(yourCaps(page)).toHaveText(new RegExp(`^${caps}`))
    await expect(onLayout(page)).toHaveText(String((red ? 5 : 0) + (hit ? 5 : 0)))
    await expect(log(page).getByText(red ? 'Red wins 5, and the 5 stays up.' : /^(Red loses 5|2 bets lose 10 caps)\./)).toHaveCount(1)

    // The spin is on the record.
    await page.getByRole('button', { name: 'Leave table' }).click()
    await page.getByRole('link', { name: 'Back to the hub' }).click()
    await page.getByRole('link', { name: 'Records' }).click()
    await expect(page.getByRole('row', { name: /Roulette/ }).getByRole('cell').first()).toHaveText('1')
    expect(errors).toEqual([])
  })
}

test('bets on the lines, take-downs, Clear and Rebet', async ({ page }) => {
  test.setTimeout(90_000)
  const errors = watchErrors(page)
  await sitDown(page)
  // A split on the line between 14 and 17, and a corner where 16, 17, 19 and 20 meet; the guide names them.
  await spot(page, 'split-14-17').click()
  await expect(page.locator('.rl-hud__help')).toContainText('Split 14/17: pays 17 to 1, house edge 2.70%.')
  await spot(page, 'corner-16-17-19-20').click()
  await spot(page, 'street-16').click()
  await page.getByRole('radio', { name: /^Bet with 1 chips/ }).click()
  await spot(page, 'line-16').click()
  await expect(onLayout(page)).toHaveText('16')

  // Take one down, then clear the rest: everything comes back.
  await page.getByRole('radio', { name: 'Take down' }).click()
  await spot(page, 'split-14-17').click()
  await expect(onLayout(page)).toHaveText('11')
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(onLayout(page)).toHaveText('0')
  await expect(yourCaps(page)).toHaveText(/^500/)

  // A number straight up, spun until it loses, and Rebet puts it back.
  await page.getByRole('radio', { name: /^Bet with 5 chips/ }).click()
  await spot(page, 'straight-36').click()
  await expect(async () => {
    if (await page.getByRole('button', { name: /^Spin/ }).isEnabled()) await spin(page)
    await expect(onLayout(page)).toHaveText('0', { timeout: 100 })
  }).toPass({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Rebet' }).click()
  await expect(onLayout(page)).toHaveText('5')
  await expect(page.locator('.rl-stack.is-mine')).toHaveCount(1)

  // Getting up hands back everything on the layout.
  const caps = Number((await yourCaps(page).textContent())!.replace(/\D/g, ''))
  await page.getByRole('button', { name: 'Leave table' }).click()
  await expect(page.locator('.rl-caps')).toHaveText(`${(caps + 5).toLocaleString()} caps`)
  expect(errors).toEqual([])
})

test('every bet on a number, from its chooser', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page)
  await spot(page, 'straight-17').click({ button: 'right' })
  const chooser = page.getByRole('dialog', { name: 'Bets on 17' })
  await expect(chooser.getByRole('button')).toHaveCount(13)
  await chooser.getByRole('button', { name: /^Six line 16–21/ }).click()
  await expect(chooser).toHaveCount(0)
  await expect(onLayout(page)).toHaveText('5')
  expect(errors).toEqual([])
})

test('the French wheel calls in French and takes even chances in twos', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page, 'French')
  await expect(page.locator('.rl-hud__status')).toHaveText('Faites vos jeux')
  await expect(page.getByText('Manque', { exact: true })).toBeAttached()
  // Five on red goes down as six, and Henri says why.
  await spot(page, 'red').click()
  await expect(onLayout(page)).toHaveText('6')
  await expect(page.locator('.rl-hud__help')).toContainText('Even chances go down in twos at the French wheel')
  // The guide lights the even chances: la partage makes them the best bets on the table.
  await expect(page.locator('.rl-box.is-advised')).toHaveCount(6)
  await page.getByRole('button', { name: /^Spin/ }).click()
  await expect(page.locator('.rl-hud__status')).toHaveText('Rien ne va plus')
  await expect(page.locator('.rl-talk--croupier .rl-talk__bubble')).toContainText('Rien ne va plus')
  await expect(log(page).getByText(/^The ball lands on /)).toHaveCount(1, { timeout: SPIN })
  expect(errors).toEqual([])
})

test('the American wheel has the double zero, and the top line', async ({ page }) => {
  const errors = watchErrors(page)
  await sitDown(page, 'American', 'Grand Salon')
  await expect(spot(page, 'straight-00')).toBeAttached()
  await expect(page.locator('.rl-rotor__art text')).toHaveCount(38)
  await page.getByRole('radio', { name: /^Bet with 5 chips/ }).click()
  await spot(page, 'top-line').click()
  await expect(onLayout(page)).toHaveText('5')
  await expect(page.locator('.rl-hud__help')).toContainText('Top line: pays 6 to 1, house edge 7.89%.')
  // The Grand Salon takes 25 at least on the outside.
  await spot(page, 'dozen-1').click()
  await expect(onLayout(page)).toHaveText('30')
  await expect(page.locator('.rl-hud__help')).toContainText('The minimum there is 25.')
  expect(errors).toEqual([])
})

test('the odds page shows every bet on every wheel', async ({ page }) => {
  await page.goto('/#/roulette/bets')
  const row = (name: string) => page.getByRole('row', { name: new RegExp(`^${name}`) }).getByRole('cell')
  await expect(row('Straight up')).toHaveText(['35 to 1', '2.70%', '2.70%', '5.26%', 'One number.'])
  await expect(row('Even chances')).toHaveText(['even money', '2.70%', '1.35%', '5.26%', /Red or black/])
  await expect(row('Top line')).toHaveText(['6 to 1', '—', '—', '7.89%', /American only/])
})

test('two players at an online wheel: the same ball, everyone’s chips, and the host spins', async ({ browser }) => {
  test.setTimeout(90_000)
  const { context, host, guest, errors } = await twoPlayers(browser)
  const code = await hostTable(host, 'roulette', 'Hostess')
  await joinTable(guest, 'roulette', code, 'Guesty')
  await expect(host.getByRole('list', { name: 'Players' })).toContainText('Guesty')
  await host.getByLabel('Wheel').selectOption('american')
  await host.getByRole('button', { name: 'Start' }).click()
  for (const page of [host, guest]) await expect(page.getByRole('region', { name: 'Roulette layout' })).toBeVisible()
  await expect(guest.locator('[data-spot="straight-00"]')).toBeAttached()
  // No regulars online: just the two of you.
  await expect(host.locator('.rl-plate')).toHaveCount(2)

  // Each bets on their own layout, and sees the other's chips in their color.
  await spot(host, 'red').click()
  await spot(guest, 'black').click()
  await spot(guest, 'straight-17').click()
  for (const page of [host, guest]) await expect(page.locator('.rl-stack')).toHaveCount(3)
  await expect(host.locator('.rl-plate.is-player .rl-plate__stack')).toHaveText(/^10/)

  // The guest is done; the host says so too, and the wheel spins at both tables.
  await guest.getByRole('button', { name: /^Done betting/ }).click()
  await expect(guest.getByText(/Your 10 caps are down\. Waiting for/)).toBeVisible()
  await expect(host.locator('.rl-plate.is-player')).toHaveClass(/is-done/)
  await host.getByRole('button', { name: /^Done betting/ }).click()
  for (const page of [host, guest]) await expect(log(page).getByText(/^The ball lands on /)).toHaveCount(1, { timeout: SPIN })
  const status = await host.locator('.rl-hud__status').textContent()
  await expect(guest.locator('.rl-hud__status')).toHaveText(status!)

  // The next spin, the host goes without the guest.
  await host.getByRole('button', { name: /^Done betting/ }).click()
  await host.getByRole('button', { name: 'Spin without them' }).click()
  for (const page of [host, guest]) await expect(log(page).getByText(/^The ball lands on /)).toHaveCount(2, { timeout: SPIN })
  await expect(guest.locator('.rl-hud__status')).toHaveText((await host.locator('.rl-hud__status').textContent())!)
  const board = (page: Page) => page.locator('.rl-numbers__list li').allTextContents()
  expect(await board(guest)).toEqual(await board(host))

  expect(errors.flat()).toEqual([])
  await context.close()
})
