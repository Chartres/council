// A whole session walked by a script, the way he walks it on his iPhone: a phone-sized
// Chromium with an iPhone user agent (so the app takes the iPhone path: words written down
// by the gateway, no browser voice), real speech into the mic (macOS `say`), real Whisper
// and Aura on the gateway, and a screen video with both sides of the sound mixed in.
//
// The local stack (no production credentials; a door key made for the run):
//   PW=$(openssl rand -hex 8)
//   (cd ../flywheel/gateway && npx wrangler dev --env="" --port 8787 --var ACCESS_PASSWORD:$PW \
//     --var FREE_MODEL:@cf/meta/llama-4-scout-17b-16e-instruct --var RETRIEVAL:off)   # real Whisper, Aura, Workers AI
//   VITE_GATEWAY_URL=http://localhost:8787 npx vite build --outDir /tmp/walk-dist && npx vite preview --outDir /tmp/walk-dist --port 5199
//   PW=$PW OUT=/tmp/walk npm run walk          # READ_ALOUD=0 walks the typed path; SCRIPT=other.json another journey
// The local model is Workers AI's Llama, not production's Haiku: say so when reporting wording.
//
// Out: $OUT/walk.mp4 (video + sound), $OUT/shots/*.png, $OUT/events.jsonl, $OUT/report.md.
// ponytail: Chromium with an iPhone UA, not WebKit: Playwright's WebKit cannot take a fake
// mic. What only Safari does (audio unlock rules, gesture timing) is not covered here.

import { chromium, devices } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const APP = process.env.APP ?? 'http://localhost:5199'
const PW = process.env.PW ?? ''
const OUT = process.env.OUT ?? `walk-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`
const SCRIPT = JSON.parse(readFileSync(process.env.SCRIPT ?? new URL('./walkthrough.json', import.meta.url), 'utf8'))
mkdirSync(join(OUT, 'shots'), { recursive: true })
mkdirSync(join(OUT, 'audio'), { recursive: true })
mkdirSync(join(OUT, 'video'), { recursive: true })

const t0 = Date.now()
const now = () => Date.now() - t0
const log = (kind, data = {}) => {
  const e = { t: now(), kind, ...data }
  appendFileSync(join(OUT, 'events.jsonl'), JSON.stringify(e) + '\n')
  console.log(`${(e.t / 1000).toFixed(1).padStart(6)}s ${kind} ${JSON.stringify(data).slice(0, 160)}`)
  return e
}
let shotN = 0
const shot = async (page, name) => {
  const file = `${String(++shotN).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: join(OUT, 'shots', file) })
  log('shot', { file })
}

// Speech clips: `say` → 16 kHz WAV, one per line he says.
const clip = (i, text) => {
  const file = join(OUT, 'audio', `me-${i}.wav`)
  execFileSync('say', ['-v', process.env.VOICE ?? 'Daniel', '-r', '175', '-o', file, '--data-format=LEI16@16000', text])
  return file
}

// The mic: one stream from the page's own AudioContext, a faint room hiss plus whatever clip is
// "said" into it. Real MediaRecorder, real upload, real Whisper.
const MIC = `
  (() => {
    let ctx, dest
    const ensure = async () => {
      if (ctx) return
      ctx = new AudioContext(); await ctx.resume()
      dest = ctx.createMediaStreamDestination()
      const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1)
      const src = ctx.createBufferSource(); src.buffer = n; src.loop = true
      const g = ctx.createGain(); g.gain.value = 0.004; src.connect(g).connect(dest); src.start()
    }
    window.__mics = 0
    navigator.mediaDevices.getUserMedia = async () => {
      await ensure(); window.__mics++; window.__out?.('mic-open', String(window.__mics))
      return new MediaStream(dest.stream.getAudioTracks().map((t) => t.clone()))
    }
    window.__say = async (b64) => {
      await ensure()
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const buf = await ctx.decodeAudioData(bytes.buffer)
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(dest)
      await new Promise((r) => { s.onended = r; s.start() })
    }
    // What the phone plays: every <audio> start/stop, with the bytes of each new source.
    const sent = new Set()
    for (const ev of ['playing', 'pause', 'ended', 'error']) document.addEventListener(ev, async (e) => {
      const el = e.target; if (!(el instanceof HTMLMediaElement)) return
      const src = el.currentSrc || el.src
      window.__out?.('audio-' + ev, JSON.stringify({ src: src.slice(-12), at: el.currentTime }))
      if (ev === 'playing' && !sent.has(src)) {
        sent.add(src)
        try { const b = await (await fetch(src)).arrayBuffer(); let s = ''; new Uint8Array(b).forEach((x) => (s += String.fromCharCode(x)))
          window.__out?.('audio-bytes', JSON.stringify({ src: src.slice(-12), b64: btoa(s) })) } catch {}
      }
    }, true)
    if (window.speechSynthesis) { const sp = speechSynthesis.speak.bind(speechSynthesis)
      speechSynthesis.speak = (u) => { window.__out?.('browser-voice', u.text); sp(u) } }
  })()
`

const audioPlays = [] // { file, start, end }
let open = {} // src → { file, start }
let bytesBySrc = {}
let clipN = 0

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const iphone = devices['iPhone 13']
const context = await browser.newContext({
  ...iphone,
  viewport: { width: 390, height: 700 },
  recordVideo: { dir: join(OUT, 'video'), size: { width: 390, height: 700 } },
  permissions: ['microphone'],
  storageState: {
    cookies: [],
    origins: [{ origin: APP, localStorage: [{ name: 'council:key', value: PW }, { name: 'council:talk', value: process.env.READ_ALOUD === '0' ? '0' : '1' }, { name: 'fw:whats-new', value: JSON.parse(readFileSync('whats-new.json', 'utf8')).version }] }],
  },
})
const videoT0 = now()
await context.exposeBinding('__out', (_src, kind, data) => {
  if (kind === 'audio-bytes') {
    const { src, b64 } = JSON.parse(data)
    const file = join(OUT, 'audio', `out-${++clipN}.bin`)
    writeFileSync(file, Buffer.from(b64, 'base64'))
    bytesBySrc[src] = file
    for (const p of audioPlays) if (p.src === src && !p.file) p.file = file
    return
  }
  if (kind === 'audio-playing') {
    const { src } = JSON.parse(data)
    open[src] = { src, start: now(), file: bytesBySrc[src] }
  }
  if (kind === 'audio-pause' || kind === 'audio-ended' || kind === 'audio-error') {
    const { src } = JSON.parse(data)
    if (open[src]) { audioPlays.push({ ...open[src], end: now(), how: kind }); delete open[src] }
  }
  log(kind, { data })
})
await context.addInitScript(MIC)
const page = await context.newPage()
page.on('console', (m) => m.type() === 'error' && log('console-error', { text: m.text().slice(0, 300) }))
page.on('pageerror', (e) => log('page-error', { text: String(e).slice(0, 300) }))
const reqStart = new Map()
page.on('request', (r) => {
  if (!r.url().includes('/v1/')) return
  reqStart.set(r, now())
  const path = new URL(r.url()).pathname
  let body = ''
  try { body = path === '/v1/tts' ? JSON.parse(r.postData() ?? '{}').text?.slice(0, 120) ?? '' : '' } catch {}
  log('req', { path, body })
})
page.on('requestfinished', async (r) => {
  if (!r.url().includes('/v1/')) return
  const res = await r.response()
  const path = new URL(r.url()).pathname
  let text = ''
  if (path === '/v1/stt') try { text = (await res.json()).text } catch {}
  log('res', { path, status: res?.status(), ms: now() - (reqStart.get(r) ?? now()), text })
})
page.on('requestfailed', (r) => r.url().includes('/v1/') && log('req-failed', { path: new URL(r.url()).pathname, error: r.failure()?.errorText }))

const status = () => page.getByTestId('talk-status').textContent({ timeout: 1000 }).catch(() => '')
const bar = () => page.getByTestId('voice-bar')
const mySay = []
const say = async (text) => {
  const file = clip(mySay.length, text)
  const start = now()
  log('say', { text })
  await page.evaluate((b64) => window.__say(b64), readFileSync(file).toString('base64'))
  mySay.push({ file, start })
}
// Wait for any of the bar's buttons; returns the testid that showed.
const waitFor = async (ids, ms = 180_000) => {
  const sel = ids.map((i) => `[data-testid="${i}"]`).join(',')
  const el = page.locator(sel).first()
  await el.waitFor({ state: 'visible', timeout: ms })
  return el.getAttribute('data-testid')
}
// Watch the status line: every change is logged, so slow steps show up with their times.
let lastStatus = ''
const watcher = setInterval(async () => {
  const s = (await status())?.trim()
  if (s && s !== lastStatus) { lastStatus = s; log('status', { s }) }
}, 400)

try {
  await page.goto(APP)
  await page.waitForTimeout(1500)
  await shot(page, 'home')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.waitForTimeout(800)
  await shot(page, 'intake')

  // The question, said aloud.
  await page.getByTestId('mic').first().click()
  await page.waitForTimeout(600)
  await say(SCRIPT.question)
  await page.waitForTimeout(500)
  await page.getByTestId('mic').first().click() // Finish
  log('intake-finish')
  await page.locator('textarea').first().waitFor()
  await page.waitForFunction(() => (document.querySelector('textarea')?.value ?? '').length > 10, null, { timeout: 30_000 })
  log('intake-words', { text: await page.locator('textarea').first().inputValue() })
  await shot(page, 'intake-written')
  await page.getByRole('button', { name: 'Bring it to the group' }).click()
  log('sent-question')

  await page.getByTestId('floor').first().waitFor({ timeout: 120_000 })
  await shot(page, 'first-floor')
  // Voice first: Read aloud is on from the start (his stored switch), so the opening is read too.

  for (const [i, turn] of SCRIPT.turns.entries()) {
    // His turn: with read aloud on the mic may already be open (Finish), or the room asks for a tap.
    const at = await waitFor(['voice-finish', 'voice-talk', 'voice-start', 'voice-resume'])
    log('his-turn', { i, at, status: await status() })
    await shot(page, `turn${i}-ready`)
    if (turn.reply != null) {
      const msg = page.getByTestId('contribution').nth(turn.reply)
      const name = (await msg.getByTestId('speaker').textContent())?.trim()
      // A swipe right, as with a thumb.
      const box = await msg.boundingBox()
      const x = box.x + 60, y = box.y + Math.min(box.height / 2, 80)
      await msg.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, isPrimary: true })
      for (let k = 1; k <= 6; k++) await msg.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 7, clientX: x + 15 * k, clientY: y + k })
      await msg.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, clientX: x + 90, clientY: y + 6 })
      log('swipe-reply', { to: name, replying: await page.getByTestId('replying').count() })
      await shot(page, `turn${i}-replying`)
    }
    if (turn.tap) {
      await page.getByRole('button', { name: turn.tap, exact: true }).first().click()
      log('tap', { name: turn.tap })
      continue
    }
    if (turn.steer) {
      await page.getByTestId('floor-more').click()
      await page.getByRole('button', { name: turn.steer }).click()
      log('steer', { to: turn.steer })
      continue
    }
    const now1 = await waitFor(['voice-finish', 'voice-talk', 'voice-start', 'voice-resume'])
    if (now1 !== 'voice-finish') await bar().getByTestId(now1).click()
    await waitFor(['voice-finish'], 10_000)
    await page.waitForTimeout(500)
    await say(turn.say)
    await page.waitForTimeout(400)
    await bar().getByTestId('voice-finish').click()
    log('finish', { i })
    await waitFor(['voice-send'], 30_000)
    await page.waitForFunction(() => !document.querySelector('[data-testid="voice-send"]')?.disabled, null, { timeout: 30_000 })
    log('draft', { text: (await page.getByTestId('draft').textContent().catch(() => ''))?.trim() })
    await shot(page, `turn${i}-draft`)
    await bar().getByTestId('voice-send').click()
    log('sent', { i })
    await page.waitForTimeout(1500)
    await shot(page, `turn${i}-sent`)
  }
  // Let the last answer and any proposal arrive and be read.
  await page.getByTestId('verdict').waitFor({ timeout: 240_000 }).then(() => log('verdict')).catch(() => log('no-verdict'))
  await page.waitForTimeout(20_000)
  await shot(page, 'end')
  await page.screenshot({ path: join(OUT, 'shots', 'end-full.png'), fullPage: true })
} catch (e) {
  log('walk-error', { error: String(e).slice(0, 400) })
  await shot(page, 'error').catch(() => {})
} finally {
  clearInterval(watcher)
  for (const k of Object.keys(open)) audioPlays.push({ ...open[k], end: now(), how: 'cut' })
  const transcript = await page.locator('main').innerText().catch(() => '')
  writeFileSync(join(OUT, 'transcript.txt'), transcript)
  await context.close()
  await browser.close()
}

// The video with both sides of the sound: his clips and every adviser clip at the moment it played.
const webm = readdirSync(join(OUT, 'video')).find((f) => f.endsWith('.webm'))
const tracks = [
  ...mySay.map((m) => ({ file: m.file, start: m.start, end: null })),
  ...audioPlays.filter((p) => p.file).map((p) => ({ file: p.file, start: p.start, end: p.end })),
]
writeFileSync(join(OUT, 'plays.json'), JSON.stringify({ videoT0, mySay, audioPlays }, null, 1))
if (webm && tracks.length) {
  const args = ['-y', '-i', join(OUT, 'video', webm)]
  tracks.forEach((t) => args.push('-i', t.file))
  const parts = tracks.map((t, i) => {
    const delay = Math.max(0, t.start - videoT0)
    const cut = t.end ? `,atrim=0:${((t.end - t.start) / 1000).toFixed(2)}` : ''
    return `[${i + 1}:a]aresample=44100${cut},adelay=${delay}|${delay}[a${i}]`
  })
  const mix = `${parts.join(';')};${tracks.map((_, i) => `[a${i}]`).join('')}amix=inputs=${tracks.length}:normalize=0[out]`
  args.push('-filter_complex', mix, '-map', '0:v', '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(OUT, 'walk.mp4'))
  try { execFileSync('ffmpeg', args, { stdio: 'ignore' }); log('video', { file: join(OUT, 'walk.mp4') }) } catch (e) { log('ffmpeg-error', { error: String(e).slice(0, 200) }) }
}
