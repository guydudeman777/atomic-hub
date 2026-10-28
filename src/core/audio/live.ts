/**
 * The live audio session: one AudioContext for the whole hub. Browsers
 * don't allow sound until the player clicks or presses a key, so music and
 * chatter start then. Audio pauses while the tab is hidden, and follows the
 * settings and the screen the player is on.
 */

import { useSave } from '../../store/save'
import { createRng, randomSeed } from '../rng'
import { SampleBank } from './bank'
import { Crowd, CrowdTakes, type CrowdReaction } from './crowd'
import { type AudioScene, type Mixer, createMixer, sceneHasCrowd, setLevels } from './mixer'
import { Radio } from './music'

/**
 * How far ahead music and chatter are scheduled, in seconds. Plenty: on a
 * phone, a hard opponent thinking or a table being laid out can keep the
 * page busy for a second or more, and when nothing has been scheduled the
 * band stops. Switching either off still fades at once.
 */
const LOOKAHEAD = 3
const TICK_MS = 250
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const

let ctx: AudioContext | null = null
let mixer: Mixer | null = null
let scene: AudioScene = 'hub'
let radio: Radio | null = null
let crowd: Crowd | null = null
let timer: number | undefined
const rng = createRng(randomSeed())
// Kept for the whole visit, so switching the radio off and on, or sitting
// down at another table, doesn't mean recording every sound again.
const bank = new SampleBank()
const takes = new CrowdTakes()
const ignore = () => {}

/** The live mixer, created on first use. Null where there's no Web Audio. */
export function liveMixer(): Mixer | null {
  if (!mixer) {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return null
    ctx = createContext()
    mixer = createMixer(ctx)
    // Effects are ready at once; music and chatter fade in.
    setLevels(mixer, useSave.getState().settings, scene, 3)
  }
  // Suspended before the first click or key press, or interrupted by the
  // system (on iOS, a call or another app's audio). Gestures try again.
  if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().then(start, ignore)
  return mixer
}

/**
 * 32 kHz is plenty for this music (its speaker rolls off at 7 kHz) and a
 * third less work than 48 kHz for everything in the graph. A balanced
 * latency gives the audio a larger buffer to absorb a busy moment, at a
 * delay too short to notice on a card landing.
 */
function createContext(): AudioContext {
  try {
    return new AudioContext({ latencyHint: 'balanced', sampleRate: 32000 })
  } catch {
    return new AudioContext({ latencyHint: 'balanced' })
  }
}

/** Listen for gestures, the tab being hidden, and settings changes. Call once. */
export function initAudio() {
  // Every gesture, not just the first: audio the system interrupted only comes back with one.
  for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) ctx.suspend().catch(ignore)
    else if (timer !== undefined) ctx.resume().catch(ignore)
  })
  useSave.subscribe((state, prev) => {
    if (mixer && state.settings !== prev.settings) setLevels(mixer, state.settings, scene, 0.3)
  })
}

/** Move the listener: the terminal hears the saloon through a wall; the tables are in it. */
export function setAudioScene(next: AudioScene) {
  if (next === scene) return
  scene = next
  if (mixer) setLevels(mixer, useSave.getState().settings, scene, 1.2)
}

export function crowdReaction(kind: CrowdReaction) {
  // Hidden, the audio is paused, and the room would cheer whenever the tab came back.
  if (ctx && crowd && !document.hidden) crowd.react(kind, ctx.currentTime + 0.05)
}

function unlock() {
  if (ctx?.state === 'running' && timer !== undefined) return
  liveMixer()
  start()
}

function start() {
  if (timer !== undefined || ctx?.state !== 'running') return
  tick()
  timer = window.setInterval(tick, TICK_MS)
}

function tick() {
  if (!ctx || !mixer || ctx.state !== 'running') return
  const { music, musicVolume, chatter, chatterVolume } = useSave.getState().settings
  const now = ctx.currentTime

  if (music && musicVolume > 0) {
    radio ??= new Radio(mixer, rng, now + 0.1, bank)
    radio.scheduleUntil(now + LOOKAHEAD, now)
  } else if (radio) {
    radio.stop(now)
    radio = null
  }

  if (chatter && chatterVolume > 0 && sceneHasCrowd(scene)) {
    crowd ??= new Crowd(mixer, rng, now + 0.1, takes)
    crowd.scheduleUntil(now + LOOKAHEAD, now)
  } else if (crowd) {
    crowd.stop(now)
    crowd = null
  }
}
