/**
 * The live audio session: one AudioContext for the whole hub. Browsers
 * don't allow sound until the player clicks or presses a key, so music and
 * chatter start then. Audio pauses while the tab is hidden, and follows the
 * settings and the screen the player is on.
 */

import { useSave } from '../../store/save'
import { createRng, randomSeed } from '../rng'
import { Crowd, type CrowdReaction } from './crowd'
import { type AudioScene, type Mixer, createMixer, sceneHasCrowd, setLevels } from './mixer'
import { Radio } from './music'

/** How far ahead music and chatter are scheduled, in seconds. */
const LOOKAHEAD = 1.5
const TICK_MS = 250
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const

let ctx: AudioContext | null = null
let mixer: Mixer | null = null
let scene: AudioScene = 'hub'
let radio: Radio | null = null
let crowd: Crowd | null = null
let timer: number | undefined
const rng = createRng(randomSeed())
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
  // Before the first click or key press this is refused; the gesture listener tries again.
  if (ctx?.state === 'suspended' && !document.hidden) ctx.resume().then(start, ignore)
  return mixer
}

/**
 * 32 kHz is plenty for this music (its speaker rolls off at 7 kHz) and a
 * third less work than 48 kHz for everything in the graph.
 */
function createContext(): AudioContext {
  try {
    return new AudioContext({ latencyHint: 'interactive', sampleRate: 32000 })
  } catch {
    return new AudioContext({ latencyHint: 'interactive' })
  }
}

/** Listen for the first gesture, the tab being hidden, and settings changes. Call once. */
export function initAudio() {
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true)
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
  if (ctx && crowd) crowd.react(kind, ctx.currentTime + 0.05)
}

function unlock() {
  liveMixer()
  start()
}

function start() {
  if (timer !== undefined || ctx?.state !== 'running') return
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true)
  tick()
  timer = window.setInterval(tick, TICK_MS)
}

function tick() {
  if (!ctx || !mixer || ctx.state !== 'running') return
  const { music, musicVolume, chatter, chatterVolume } = useSave.getState().settings
  const now = ctx.currentTime

  if (music && musicVolume > 0) {
    radio ??= new Radio(mixer, rng, now + 0.1)
    radio.scheduleUntil(now + LOOKAHEAD)
  } else if (radio) {
    radio.stop(now + LOOKAHEAD + 1)
    radio = null
  }

  if (chatter && chatterVolume > 0 && sceneHasCrowd(scene)) {
    crowd ??= new Crowd(mixer, rng, now + 0.1)
    crowd.scheduleUntil(now + LOOKAHEAD)
  } else if (crowd) {
    // Let the bus fade first.
    crowd.stop(now + 2)
    crowd = null
  }
}
