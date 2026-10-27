import { useSave } from '../store/save'
import { GAMES } from './games'
import { Terminal } from './Terminal'

export function RecordsScreen() {
  const stats = useSave((s) => s.stats)
  const played = GAMES.filter((g) => stats[g.id]?.played)

  return (
    <Terminal back>
      <div className="hub-page">
        <h2 className="term-heading">Records</h2>
        {played.length === 0 ? (
          <p className="term-dim">Nothing on the books yet. Finish a game and it shows up here.</p>
        ) : (
          <div className="records-scroll">
            <table className="records">
              <thead>
                <tr>
                  <th scope="col">Game</th>
                  <th scope="col">Played</th>
                  <th scope="col">Won</th>
                  <th scope="col">Lost</th>
                  <th scope="col">Best streak</th>
                  <th scope="col">Caps won</th>
                  <th scope="col">Caps lost</th>
                </tr>
              </thead>
              <tbody>
                {played.map((g) => {
                  const s = stats[g.id]
                  return (
                    <tr key={g.id}>
                      <th scope="row">{g.name}</th>
                      <td>{s.played}</td>
                      <td>{s.won}</td>
                      <td>{s.lost}</td>
                      <td>{s.bestStreak}</td>
                      <td>{s.capsWon}</td>
                      <td>{s.capsLost}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Terminal>
  )
}
