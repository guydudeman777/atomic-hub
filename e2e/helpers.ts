import type { Page } from '@playwright/test'

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
