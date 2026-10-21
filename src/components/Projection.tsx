import { GAMES, type ConferenceProjection, type TeamProjection } from '../lib/projection'
import { href } from '../lib/router'
import { useFavorites } from '../lib/store'

/** Probabilité en % : jamais « 0 % » ni « 100 % », une simulation ne prouve pas qu'un cas est impossible. */
export function pctLabel(p: number): string {
  if (p < 0.005) return '<1 %'
  if (p >= 0.995) return '>99 %'
  return `${Math.round(p * 100)} %`
}

const place = (k: number) => (k ? `${k + 1}e` : '1re')

const cellLabel = (p: number) => (p < 0.005 ? '' : String(Math.min(99, Math.round(p * 100))))

// Séparateurs comme au classement : après la 6e place (playoffs) et la 10e (play-in).
const zone = (k: number) => (k === 5 ? 'cut-playoffs' : k === 9 ? 'cut-playin' : '')

const projRecord = (t: TeamProjection) => `${Math.round(t.projWins)}-${GAMES - Math.round(t.projWins)}`

/** Tableau de chaleur : une ligne par équipe, une colonne par place finale, en % de chances. */
export function ProjectionTable({ conf }: { conf: ConferenceProjection }) {
  const { has } = useFavorites()
  return (
    <div className="card flush">
      <div className="table-scroll">
        <table className="standings proj">
          <thead>
            <tr>
              <th scope="col" className="left">Équipe</th>
              {conf.teams.map((_, k) => (
                <th key={k} scope="col" className={zone(k)}>{k + 1}</th>
              ))}
              <th scope="col" className="po">Playoffs</th>
            </tr>
          </thead>
          <tbody>
            {conf.teams.map((t) => (
              <tr key={t.team.id} className={has(t.team.id) ? 'fav' : ''}>
                <th scope="row" className="left">
                  <a href={href.team(t.team.id)} className="st-team">
                    {t.team.abbr}
                  </a>
                </th>
                {t.seeds.map((p, k) => (
                  <td
                    key={k}
                    className={`heat ${zone(k)}`}
                    style={{ ['--p' as string]: p }}
                    title={`${t.team.abbr} ${place(k)} : ${pctLabel(p)}`}
                  >
                    {cellLabel(p)}
                  </td>
                ))}
                <td className="strong">{pctLabel(t.playoffs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Histogramme des places finales possibles d'une équipe. */
export function SeedChart({ t }: { t: TeamProjection }) {
  const max = Math.max(...t.seeds)
  const best = t.seeds.indexOf(max)
  const zones = [
    { label: 'Top 6', p: t.seeds.slice(0, 6) },
    { label: 'Play-in', p: t.seeds.slice(6, 10) },
    { label: 'Éliminé', p: t.seeds.slice(10) },
  ]
  return (
    <>
      <div className="proj-stats">
        <div>
          <strong>{projRecord(t)}</strong>
          <span>bilan projeté</span>
        </div>
        <div>
          <strong>{place(best)}</strong>
          <span>place la plus probable</span>
        </div>
        <div>
          <strong>{pctLabel(t.playoffs)}</strong>
          <span>en playoffs</span>
        </div>
      </div>
      <div
        className="seed-chart"
        role="img"
        aria-label={t.seeds.map((p, k) => `${place(k)} : ${pctLabel(p)}`).join(', ')}
      >
        {t.seeds.map((p, k) => (
          <div key={k} className={`seed-col ${zone(k)}`} title={`${place(k)} : ${pctLabel(p)}`}>
            <span className="seed-plot">
              <span className="seed-val">{p >= 0.02 ? Math.round(p * 100) : ''}</span>
              <span className="seed-bar" style={{ height: `calc((100% - 14px) * ${max ? p / max : 0})` }} />
            </span>
            <span className="seed-rank">{k + 1}</span>
          </div>
        ))}
      </div>
      <div className="seed-zones">
        {zones.map((z) => (
          <span key={z.label} style={{ flex: z.p.length }}>
            {z.label} <strong>{pctLabel(z.p.reduce((s, p) => s + p, 0))}</strong>
          </span>
        ))}
      </div>
      <p className="footnote left">
        Entre {t.winsRange[0]} et {t.winsRange[1]} victoires dans 8 simulations sur 10. Playoffs : top 6, ou qualifié
        par le play-in.
      </p>
    </>
  )
}
