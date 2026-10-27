/**
 * Renders the PNG app icons in public/ from public/favicon.svg, squared off
 * to full bleed: phones round or mask the corners themselves, and the atom
 * already sits inside the safe zone of a maskable icon.
 *
 * Run after changing the favicon: node scripts/render-icons.mjs
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const publicDir = (file) => fileURLToPath(new URL(`../public/${file}`, import.meta.url))
const svg = (await readFile(publicDir('favicon.svg'), 'utf8')).replace(/ rx="\d+"/, '')
const SIZES = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 }

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, size] of Object.entries(SIZES)) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`)
  await page.screenshot({ path: publicDir(file) })
}
await browser.close()
