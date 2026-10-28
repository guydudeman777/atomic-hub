import type { Player } from '../engine'

/** A small disc in a player's color, for labels and scores. */
export function DiscIcon({ player }: { player: Player }) {
  return <span className="rv-disc-icon" data-c={player} aria-hidden="true" />
}
