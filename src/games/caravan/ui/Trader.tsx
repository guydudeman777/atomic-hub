import { useState } from 'react'
import { type Card } from '../../../core/cards'
import { PlayingCard } from '../../../components/PlayingCard'
import { createRng, randomSeed } from '../../../core/rng'
import { playSfx } from '../../../core/audio/sfx'
import { useSave } from '../../../store/save'
import { CARD_SETS, OPPONENTS, PACK_PRICE, PACK_SIZE, STARTER_SET, drawUnowned, traderSets } from '../content'

const SET_SIZE = 54

export function Trader() {
  const collection = useSave((s) => s.caravan.collection)
  const beaten = useSave((s) => s.caravan.beaten)
  const caps = useSave((s) => s.wallet.caps)
  const spendCaps = useSave((s) => s.spendCaps)
  const addCards = useSave((s) => s.addCaravanCards)
  const [opened, setOpened] = useState<{ set: string; cards: Card[] } | null>(null)

  const forSale = new Set(traderSets(beaten).map((s) => s.id))
  const owned = new Set(collection)
  const ownedIn = (set: string) => collection.filter((id) => id.startsWith(`${set}:`)).length

  const buy = (set: string) => {
    if (!spendCaps(PACK_PRICE)) {
      playSfx('error')
      return
    }
    const cards = drawUnowned(set, owned, PACK_SIZE, createRng(randomSeed()))
    addCards(cards.map((c) => c.id))
    setOpened({ set, cards })
    playSfx('coin')
    // One card turned over for each in the reveal animation (caravan.css).
    cards.forEach((_, i) => playSfx('deal', { delay: 0.05 + i * 0.08 }))
  }

  return (
    <div className="cv-trader">
      <div className="cv-paper cv-trader__intro">
        <h2>The Trader</h2>
        <p>
          Packs hold {PACK_SIZE} cards you don’t own yet, for {PACK_PRICE} caps. A set goes on sale once you’ve beaten the
          player who carries it.
        </p>
      </div>
      <ul className="cv-trader__sets">
        {CARD_SETS.filter((s) => s.id !== STARTER_SET).map((s) => {
          const have = ownedIn(s.id)
          const complete = have >= SET_SIZE
          const open = forSale.has(s.id)
          const seller = OPPONENTS.find((o) => o.set === s.id)
          return (
            <li key={s.id} className="cv-paper cv-set">
              <div className="cv-set__back">
                <PlayingCard faceDown set={s.id} />
              </div>
              <div className="cv-set__body">
                <h3>{s.name}</h3>
                <p className="cv-ink-dim">{s.blurb}</p>
                <p>
                  You own {have} of {SET_SIZE}
                </p>
                {complete ? (
                  <p className="cv-set__done">Complete</p>
                ) : open ? (
                  <button className="cv-button cv-button--primary" disabled={caps < PACK_PRICE} onClick={() => buy(s.id)}>
                    Buy a pack, {PACK_PRICE} caps
                  </button>
                ) : (
                  <p className="cv-ink-dim">Beat {seller?.name} to unlock.</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {opened && (
        <div className="cv-overlay" role="dialog" aria-modal="true" aria-labelledby="pack-title" onClick={() => setOpened(null)}>
          <div className="cv-paper cv-gameover" onClick={(e) => e.stopPropagation()}>
            <h2 id="pack-title">{opened.cards.length} new cards</h2>
            <div className="cv-gameover__cards">
              {opened.cards.map((c) => (
                <div key={c.id} className="cv-gameover__card">
                  <PlayingCard card={c} />
                </div>
              ))}
            </div>
            <p className="cv-ink-dim">They’re in your collection. Add them to a deck in the deck builder.</p>
            <div className="cv-gameover__actions">
              <button className="cv-button cv-button--primary" autoFocus onClick={() => setOpened(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
