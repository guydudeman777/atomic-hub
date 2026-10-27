import { useRef, useState } from 'react'
import { playSfx } from '../core/sfx'
import { snapshot, useSave } from '../store/save'
import { Terminal } from './Terminal'

export function SettingsScreen() {
  const settings = useSave((s) => s.settings)
  const update = useSave((s) => s.updateSettings)
  const importSave = useSave((s) => s.importSave)
  const resetSave = useSave((s) => s.resetSave)
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const exportSave = () => {
    const blob = new Blob([JSON.stringify(snapshot(useSave.getState()), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `atomic-hub-save-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('Save exported.')
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    const result = importSave(await file.text())
    setMessage(result.ok ? 'Save imported.' : result.error)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Terminal back>
      <div className="hub-page settings">
        <h2 className="term-heading">Settings</h2>

        <fieldset className="settings__group">
          <legend>Screen</legend>
          <div className="settings__row" role="radiogroup" aria-label="Phosphor color">
            <span>Phosphor</span>
            {(['green', 'amber'] as const).map((p) => (
              <label key={p} className="settings__choice">
                <input
                  type="radio"
                  name="phosphor"
                  checked={settings.phosphor === p}
                  onChange={() => {
                    update({ phosphor: p })
                    playSfx('tick')
                  }}
                />
                {p === 'green' ? 'Green' : 'Amber'}
              </label>
            ))}
          </div>
          <label className="settings__row">
            <span>Scanlines and glow</span>
            <input type="checkbox" checked={settings.crt} onChange={(e) => update({ crt: e.target.checked })} />
          </label>
          <label className="settings__row">
            <span>Screen flicker</span>
            <input type="checkbox" checked={settings.flicker} onChange={(e) => update({ flicker: e.target.checked })} />
          </label>
          <label className="settings__row">
            <span>Screen transitions</span>
            <input
              type="checkbox"
              checked={settings.transitions}
              onChange={(e) => update({ transitions: e.target.checked })}
            />
          </label>
          <p className="term-dim settings__hint">Flicker and transitions stay off if your system asks for reduced motion.</p>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Tables</legend>
          <label className="settings__row">
            <span>3D tables</span>
            <input type="checkbox" checked={settings.table3d} onChange={(e) => update({ table3d: e.target.checked })} />
          </label>
          <p className="term-dim settings__hint">
            Tilts game tables in perspective and turns cards over as they’re dealt and played. You can also switch it at the table.
          </p>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Sound</legend>
          <label className="settings__row">
            <span>Sound effects</span>
            <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
          </label>
          <label className="settings__row">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              disabled={!settings.sound}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              onPointerUp={() => playSfx('select')}
            />
          </label>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Save file</legend>
          <p className="term-dim settings__hint">
            Your caps, records and cards are saved in this browser. Export a copy to move them to another device.
          </p>
          <div className="settings__actions">
            <button className="term-button" onClick={exportSave}>
              Export save
            </button>
            <button className="term-button" onClick={() => fileRef.current?.click()}>
              Import save
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
            {confirmReset ? (
              <button
                className="term-button"
                onClick={() => {
                  resetSave()
                  setConfirmReset(false)
                  setMessage('Save reset. Fresh start with 500 caps.')
                }}
              >
                Erase everything
              </button>
            ) : (
              <button className="term-button" onClick={() => setConfirmReset(true)}>
                Start over
              </button>
            )}
          </div>
          {confirmReset && <p className="settings__hint">This erases your caps, records and cards. Click Erase everything to confirm.</p>}
          {message && (
            <p className="settings__hint" role="status">
              {message}
            </p>
          )}
        </fieldset>
      </div>
    </Terminal>
  )
}
