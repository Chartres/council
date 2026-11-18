import { readFileSync, writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { Device } from '../src/components/Furniture'

// public/device.svg (reading pages), public/device-tile.svg (the share card) and public/favicon.svg are the device
// from Furniture.tsx with the tokens written out. After changing the drawing:
//   WRITE_ASSETS=1 npx vitest run scripts/device-asset.test.mjs
// then re-run flywheel's scripts/og-image.mjs (AGENTS.md, "The device").

const TOKENS = {
  'var(--color-candle-400)': '#e0b263',
  'var(--color-candle-200)': '#f7e3b8',
  'var(--font-display)': 'EB Garamond, Iowan Old Style, Georgia, serif',
  currentColor: '#b9b1a0', // marble-300, the device's ink
}

function standalone(size) {
  let svg = renderToStaticMarkup(createElement(Device, { size }))
  for (const [token, value] of Object.entries(TOKENS)) svg = svg.replaceAll(token, value)
  return svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/ (data-testid|aria-hidden|class)="[^"]*"/g, '')
}

const ASSETS = {
  'public/device.svg': standalone(160) + '\n',
  // 32 px: the four-shape drawing on an ink tile.
  'public/favicon.svg':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Mastermind Council">' +
    '<rect width="32" height="32" rx="6" fill="#100e0b"/>' +
    standalone(21).replace('<svg ', '<svg x="5.5" y="3" ') +
    '</svg>\n',
  // The share card's mark: the full drawing on the same tile (scripts/og-image.mjs --icon).
  'public/device-tile.svg':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 168" role="img" aria-label="Mastermind Council">' +
    '<rect width="168" height="168" fill="#100e0b"/>' +
    standalone(120).replace('<svg ', '<svg x="24" y="9.6" ') +
    '</svg>\n',
}

describe('the device as static files', () => {
  it('uses the tokens index.css defines', () => {
    const css = readFileSync('src/index.css', 'utf8')
    for (const hex of ['--color-candle-400: #e0b263', '--color-candle-200: #f7e3b8', '--color-marble-300: #b9b1a0', '--color-ink-950: #100e0b'])
      expect(css).toContain(hex)
  })

  it('the committed files are what Furniture.tsx draws (WRITE_ASSETS=1 rewrites them)', () => {
    for (const [file, svg] of Object.entries(ASSETS)) {
      if (process.env.WRITE_ASSETS) writeFileSync(file, svg)
      expect(readFileSync(file, 'utf8'), file).toBe(svg)
      expect(svg).not.toMatch(/var\(|currentColor/)
    }
  })
})
