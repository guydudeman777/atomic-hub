import type { Player } from '../engine'

/** A small checker in a player's color, for labels and counts. */
export function CheckerIcon({ player }: { player: Player }) {
  return <span className="c4-checker-icon" data-c={player} aria-hidden="true" />
}
