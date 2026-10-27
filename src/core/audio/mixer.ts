/**
 * The mixing desk every sound goes through.
 *
 *   effects ───────────────────┐
 *   music ──► scene tone ──────┼──► master ──► compressor ──► speakers
 *   chatter ───────────────────┘       ▲
 *   each bus also sends to the room ───┘  (a short wooden-room reverb)
 *
 * It takes any BaseAudioContext, so the same graph can render offline.
 */

import type { Settings } from '../../store/save'

export interface Mixer {
  ctx: BaseAudioContext
  sfx: GainNode
  music: GainNode
  ambience: GainNode
  /** Reverb input, for sounds that want more room than their bus sends. */
  room: GainNode
  /** The music's tone control: open in the saloon, muffled from next door. */
  musicTone: BiquadFilterNode
  /** A few seconds each of white and pink noise, shared by everything that hisses. */
  white: AudioBuffer
  pink: AudioBuffer
}

/**
 * Where you are decides what you hear. At the terminal the saloon band is
 * playing on the other side of the wall; at a table you're in the room with
 * it, and with everyone else.
 */
export type AudioScene = 'hub' | 'saloon'

const SCENES: Record<AudioScene, { music: number; tone: number; crowd: number }> = {
  hub: { music: 0.4, tone: 450, crowd: 0 },
  saloon: { music: 0.75, tone: 6500, crowd: 1 },
}

/**
 * Overall bus levels, balanced by perceived (A-weighted) loudness at default
 * settings: card sounds on top, the band under them, the room under that.
 */
const LEVEL = { sfx: 1, music: 0.8, ambience: 0.3 }

/** Sliders feel even when loudness follows the square of their position. */
const taper = (on: boolean, volume: number) => (on ? volume * volume : 0)

export function sceneHasCrowd(scene: AudioScene): boolean {
  return SCENES[scene].crowd > 0
}

export function createMixer(ctx: BaseAudioContext): Mixer {
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -16
  compressor.knee.value = 12
  compressor.ratio.value = 3
  compressor.attack.value = 0.008
  compressor.release.value = 0.25
  compressor.connect(ctx.destination)

  const master = ctx.createGain()
  master.connect(compressor)

  // A mono reverb costs well under half a stereo one. Feeding the right
  // channel a few milliseconds late keeps it from sitting dead centre.
  const reverb = ctx.createConvolver()
  reverb.channelCount = 1
  reverb.channelCountMode = 'explicit'
  reverb.buffer = roomImpulse(ctx)
  const room = ctx.createGain()
  room.gain.value = 0.5
  const wide = ctx.createChannelMerger(2)
  room.connect(reverb).connect(wide, 0, 0)
  const late = ctx.createDelay(0.05)
  late.delayTime.value = 0.013
  reverb.connect(late).connect(wide, 0, 1)
  wide.connect(master)

  const bus = (send: number) => {
    const g = ctx.createGain()
    g.gain.value = 0
    g.connect(master)
    const s = ctx.createGain()
    s.gain.value = send
    g.connect(s).connect(room)
    return g
  }

  const sfx = bus(0.18)
  const ambience = bus(0.9)
  const music = ctx.createGain()
  music.gain.value = 0
  const musicTone = ctx.createBiquadFilter()
  musicTone.type = 'lowpass'
  musicTone.Q.value = 0.5
  music.connect(musicTone).connect(master)
  const musicSend = ctx.createGain()
  musicSend.gain.value = 0.3
  musicTone.connect(musicSend).connect(room)

  return { ctx, sfx, music, ambience, room, musicTone, white: noiseBuffer(ctx, 'white'), pink: noiseBuffer(ctx, 'pink') }
}

/** Glide every bus to the player's settings and the scene's mix. */
export function setLevels(m: Mixer, settings: Settings, scene: AudioScene, seconds = 0.3) {
  const t = m.ctx.currentTime
  const tau = Math.max(0.01, seconds / 3)
  const mix = SCENES[scene]
  m.sfx.gain.setTargetAtTime(LEVEL.sfx * taper(settings.sound, settings.volume), t, 0.01)
  m.music.gain.setTargetAtTime(LEVEL.music * mix.music * taper(settings.music, settings.musicVolume), t, tau)
  m.musicTone.frequency.setTargetAtTime(mix.tone, t, tau)
  m.ambience.gain.setTargetAtTime(LEVEL.ambience * mix.crowd * taper(settings.chatter, settings.chatterVolume), t, tau)
}

/** Dense early reflections that darken as they fade, like a wooden room full of people. */
function roomImpulse(ctx: BaseAudioContext, seconds = 1.6): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * seconds)
  const buffer = ctx.createBuffer(1, length, rate)
  const data = buffer.getChannelData(0)
  let smooth = 0
  for (let i = 0; i < length; i++) {
    const t = i / rate
    const k = 0.15 + 0.6 * Math.exp(-t * 5)
    smooth += k * (Math.random() * 2 - 1 - smooth)
    data[i] = t < 0.008 ? 0 : smooth * Math.exp(-t * 3.6)
  }
  return buffer
}

function noiseBuffer(ctx: BaseAudioContext, color: 'white' | 'pink', seconds = 3): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let peak = 0
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1
    if (color === 'white') {
      data[i] = w
    } else {
      // Paul Kellet's economy pink-noise filter.
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      data[i] = b0 + b1 + b2 + w * 0.1848
    }
    peak = Math.max(peak, Math.abs(data[i]))
  }
  for (let i = 0; i < length; i++) data[i] /= peak
  return buffer
}
