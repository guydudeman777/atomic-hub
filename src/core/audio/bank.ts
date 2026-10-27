/**
 * Recordings of synthesized sounds, to keep the CPU cost of an evening of
 * music low. The first time a sound is needed it plays live and is also
 * rendered offline in the background; after that it plays from the
 * recording: one buffer source instead of a dozen oscillators and filters.
 */

/** Something that schedules a sound starting at `t` into `out`, on any context. */
export type Render = (ctx: BaseAudioContext, out: AudioNode, t: number) => void

/**
 * Render a sound offline into a buffer. Record at the rate it will be played
 * at: a buffer that has to be resampled on playback costs many times more.
 * Null where offline rendering isn't available.
 */
export function record(seconds: number, rate: number, render: Render): Promise<AudioBuffer> | null {
  if (typeof OfflineAudioContext === 'undefined') return null
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate)
  render(ctx, ctx.destination, 0)
  return ctx.startRendering()
}

export class SampleBank {
  /** Null while a recording is being made. */
  private readonly recordings = new Map<string, AudioBuffer | null>()

  /** Play the sound called `key` at `t`, from its recording if there is one. */
  play(key: string, seconds: number, render: Render, ctx: BaseAudioContext, out: AudioNode, t: number) {
    const buffer = this.recordings.get(key)
    if (buffer) {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(out)
      src.start(t)
      return
    }
    render(ctx, out, t)
    if (buffer === undefined) {
      const recording = record(seconds, ctx.sampleRate, render)
      if (!recording) return
      this.recordings.set(key, null)
      recording.then(
        (b) => this.recordings.set(key, b),
        () => this.recordings.delete(key),
      )
    }
  }

  clear() {
    this.recordings.clear()
  }
}
