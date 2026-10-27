import { useMemo, useState } from 'react'
import { type Card, parseCardId } from '../../../core/cards'
import { PlayingCard } from '../../../components/PlayingCard'
import { playSfx } from '../../../core/audio/sfx'
import { useSave } from '../../../store/save'
import { CARD_SETS, type SavedDeck, compareCards, isFace } from '../content'
import { MIN_DECK_SIZE, MIN_NUMBER_CARDS, checkDeck } from '../engine'

type Kind = 'all' | 'number' | 'face'

export function DeckBuilder() {
  const collectionIds = useSave((s) => s.caravan.collection)
  const decks = useSave((s) => s.caravan.decks)
  const activeDeckId = useSave((s) => s.caravan.activeDeckId)
  const saveDeck = useSave((s) => s.saveCaravanDeck)
  const deleteDeck = useSave((s) => s.deleteCaravanDeck)
  const setActive = useSave((s) => s.setActiveCaravanDeck)

  const [draft, setDraft] = useState<SavedDeck>(() => decks.find((d) => d.id === activeDeckId) ?? decks[0])
  const [setFilter, setSetFilter] = useState('all')
  const [kind, setKind] = useState<Kind>('all')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const saved = decks.find((d) => d.id === draft.id)
  const dirty = !saved || saved.name !== draft.name || saved.cards.join() !== draft.cards.join()

  const collection = useMemo(() => collectionIds.map(parseCardId).sort(compareCards), [collectionIds])
  const ownedBySet = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of collection) counts[c.set] = (counts[c.set] ?? 0) + 1
    return counts
  }, [collection])

  const shown = collection.filter(
    (c) => (setFilter === 'all' || c.set === setFilter) && (kind === 'all' || (kind === 'face') === isFace(c)),
  )
  const inDeck = new Set(draft.cards)
  const deckCards = useMemo(() => draft.cards.map(parseCardId).sort(compareCards), [draft.cards])
  const check = checkDeck(deckCards)

  const edit = (cards: string[]) => {
    setDraft((d) => ({ ...d, cards }))
    setNotice(null)
  }

  const toggle = (card: Card) => {
    playSfx(inDeck.has(card.id) ? 'draw' : 'pick')
    edit(inDeck.has(card.id) ? draft.cards.filter((id) => id !== card.id) : [...draft.cards, card.id])
  }

  const switchTo = (id: string) => {
    const next = decks.find((d) => d.id === id)
    if (next) setDraft(next)
    setNotice(null)
    setConfirmDelete(false)
  }

  const newDeck = () => {
    setDraft({ id: `deck-${Date.now().toString(36)}`, name: `Deck ${decks.length + 1}`, cards: [] })
    setNotice('New deck. Click cards on the left to add them, then save.')
    setConfirmDelete(false)
  }

  const save = () => {
    const name = draft.name.trim() || 'Untitled deck'
    saveDeck({ ...draft, name })
    setDraft((d) => ({ ...d, name }))
    if (check.ok) setActive(draft.id)
    setNotice(check.ok ? 'Saved. This is now your deck at the tables.' : 'Saved, but it isn’t ready to play yet.')
    playSfx('select')
  }

  const remove = () => {
    deleteDeck(draft.id)
    const rest = decks.filter((d) => d.id !== draft.id)
    setDraft(rest[0] ?? decks[0])
    setConfirmDelete(false)
    setNotice('Deck deleted.')
  }

  return (
    <div className="cv-builder">
      <section className="cv-paper cv-builder__bar" aria-label="Deck">
        <label className="cv-field">
          <span>Deck</span>
          <select value={saved ? draft.id : ''} onChange={(e) => switchTo(e.target.value)}>
            {!saved && <option value="">{draft.name} (unsaved)</option>}
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.id === activeDeckId ? ' (playing)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="cv-field">
          <span>Name</span>
          <input value={draft.name} maxLength={28} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </label>
        <div className="cv-builder__buttons">
          <button className="cv-button cv-button--primary" onClick={save} disabled={!dirty}>
            Save deck
          </button>
          <button className="cv-button" onClick={newDeck}>
            New deck
          </button>
          {saved && decks.length > 1 && (
            <button className="cv-button" onClick={confirmDelete ? remove : () => setConfirmDelete(true)}>
              {confirmDelete ? 'Click again to delete' : 'Delete'}
            </button>
          )}
        </div>
        {notice && (
          <p className="cv-builder__notice" role="status">
            {notice}
          </p>
        )}
      </section>

      <section className="cv-builder__collection" aria-label="Your collection">
        <div className="cv-builder__filters">
          <label className="cv-field cv-field--inline">
            <span>Set</span>
            <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)}>
              <option value="all">All sets ({collection.length})</option>
              {CARD_SETS.filter((s) => ownedBySet[s.id]).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({ownedBySet[s.id]}/54)
                </option>
              ))}
            </select>
          </label>
          <div className="cv-seg" role="radiogroup" aria-label="Card type">
            {(['all', 'number', 'face'] as const).map((k) => (
              <button key={k} role="radio" aria-checked={kind === k} className="cv-seg__opt" onClick={() => setKind(k)}>
                {k === 'all' ? 'All' : k === 'number' ? 'Number' : 'Face'}
              </button>
            ))}
          </div>
          <button className="cv-button cv-button--small" onClick={() => edit([...new Set([...draft.cards, ...shown.map((c) => c.id)])])}>
            Add all shown
          </button>
          <button className="cv-button cv-button--small" onClick={() => edit(draft.cards.filter((id) => !shown.some((c) => c.id === id)))}>
            Remove all shown
          </button>
        </div>
        <ul className="cv-grid">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                className={`cv-grid__card${inDeck.has(c.id) ? ' is-in' : ''}`}
                onClick={() => toggle(c)}
                aria-pressed={inDeck.has(c.id)}
                title={inDeck.has(c.id) ? 'In deck. Click to remove.' : 'Click to add to the deck.'}
              >
                <PlayingCard card={c} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="cv-paper cv-builder__summary" aria-label="Deck summary">
        <p className="cv-builder__count">
          <span className={draft.cards.length >= MIN_DECK_SIZE ? 'is-ok' : ''}>{draft.cards.length}</span> cards
        </p>
        <dl className="cv-builder__stats">
          <dt>Number cards</dt>
          <dd className={check.numberCards >= MIN_NUMBER_CARDS ? 'is-ok' : ''}>
            {check.numberCards} <span className="cv-ink-dim">(min {MIN_NUMBER_CARDS})</span>
          </dd>
          <dt>Face cards</dt>
          <dd>{check.faceCards}</dd>
          <dt>Minimum size</dt>
          <dd>{MIN_DECK_SIZE}</dd>
        </dl>
        {check.ok ? (
          <p className="cv-builder__ok">Ready to play.</p>
        ) : (
          <ul className="cv-builder__problems">
            {check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <ul className="cv-mini-grid" aria-label="Cards in this deck">
          {deckCards.map((c) => (
            <li key={c.id}>
              <button className="cv-mini-grid__card" onClick={() => toggle(c)} title="Click to remove">
                <PlayingCard card={c} />
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
