import { useEffect, useState } from 'react'
import { fetchTeams } from '../api/espn'
import { BOOKMAKERS, CREDITS_PER_REFRESH, forgetOddsCache, refreshOdds, useOddsStatus } from '../api/oddsApi'
import { ErrorBox, Loading, PageHeader, Star, TeamLogo } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { isNative, notificationPermission, requestNotificationPermission, type Permission } from '../lib/notifications'
import { href } from '../lib/router'
import { timeAgo } from '../lib/format'
import { useAlertSettings, useFavorites, useOddsSettings, type AlertSettings } from '../lib/store'

export function TeamsPage({ active }: { active: boolean }) {
  const { data: groups, error, refresh } = usePolling((s) => fetchTeams(s), [], null, active)
  const favs = useFavorites()
  const [query, setQuery] = useState('')

  const teams = groups?.flatMap((g) => g.teams)
  const mine = (teams ?? []).filter((t) => favs.has(t.id)).sort((a, b) => a.displayName.localeCompare(b.displayName))
  const q = query.trim().toLowerCase()
  const match = (t: { displayName: string; abbr: string }) => !q || `${t.displayName} ${t.abbr}`.toLowerCase().includes(q)

  return (
    <>
      <PageHeader title="Mes équipes" subtitle="Favoris, alertes et cotes" />
      <div className="content">
        <section className="card">
          <h3 className="card-title">Favoris</h3>
          {mine.length === 0 ? (
            <p className="muted">Touchez l’étoile d’une équipe ci-dessous pour la suivre : ses matchs remontent en tête des scores.</p>
          ) : (
            <ul className="team-list">
              {mine.map((t) => (
                <li key={t.id}>
                  <a href={href.team(t.id)} className="team-link">
                    <TeamLogo team={t} size={36} />
                    <span>{t.displayName}</span>
                  </a>
                  <button className="icon-btn star on" onClick={() => favs.toggle(t.id)} aria-label={`Retirer ${t.displayName} des favoris`}>
                    <Star on />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <AlertsCard />

        <OddsSettingsCard />

        <section className="card">
          <h3 className="card-title">Toutes les équipes</h3>
          <input
            className="search"
            type="search"
            placeholder="Rechercher une équipe…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {error && !groups && <ErrorBox error={error} onRetry={refresh} />}
          {!groups && !error && <Loading />}
          {groups?.map((g) => {
            const list = g.teams.filter(match)
            if (!list.length) return null
            return (
              <div key={g.conference} className="team-group">
                <h4 className="section-title">Conférence {g.conference === 'East' ? 'Est' : 'Ouest'}</h4>
                <ul className="team-grid">
                  {list.map((t) => (
                    <li key={t.id}>
                      <a href={href.team(t.id)} className="team-tile">
                        <TeamLogo team={t} size={40} />
                        <span>{t.name}</span>
                      </a>
                      <button
                        className={`icon-btn star ${favs.has(t.id) ? 'on' : ''}`}
                        onClick={() => favs.toggle(t.id)}
                        aria-pressed={favs.has(t.id)}
                        aria-label={`${favs.has(t.id) ? 'Retirer' : 'Ajouter'} ${t.displayName} ${favs.has(t.id) ? 'des' : 'aux'} favoris`}
                      >
                        <Star on={favs.has(t.id)} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      </div>
    </>
  )
}

const ALERT_OPTIONS: { key: keyof AlertSettings; label: string; hint?: string }[] = [
  { key: 'favoritesOnly', label: 'Seulement mes équipes', hint: 'Sinon : tous les matchs de la NBA' },
  { key: 'start', label: 'Début de match' },
  { key: 'clutch', label: 'Match serré', hint: '5 points d’écart ou moins dans les 5 dernières minutes' },
  { key: 'overtime', label: 'Prolongation' },
  { key: 'final', label: 'Score final' },
]

function AlertsCard() {
  const { settings, update } = useAlertSettings()
  const [perm, setPerm] = useState<Permission>('default')
  useEffect(() => {
    notificationPermission().then(setPerm)
  }, [])

  const toggleEnabled = async () => {
    if (!settings.enabled && perm === 'default') setPerm(await requestNotificationPermission())
    update({ enabled: !settings.enabled })
  }

  return (
    <section className="card">
      <h3 className="card-title">Alertes</h3>
      <label className="switch-row">
        <span>
          <strong>Activer les alertes</strong>
          <small className="muted">Notifications pendant que l’app est ouverte ou en arrière-plan.</small>
        </span>
        <input type="checkbox" role="switch" checked={settings.enabled} onChange={toggleEnabled} />
      </label>
      {settings.enabled && perm === 'denied' && (
        <p className="warn">
          Les notifications sont bloquées par le navigateur : les alertes s’afficheront seulement dans l’app.
          {isNative
            ? ' Autorisez-les dans les réglages Android de l’application.'
            : /iPhone|iPad/.test(navigator.userAgent) && ' Sur iPhone, ajoutez d’abord l’app à l’écran d’accueil.'}
        </p>
      )}
      {settings.enabled &&
        ALERT_OPTIONS.map((o) => (
          <label key={o.key} className="switch-row sub">
            <span>
              {o.label}
              {o.hint && <small className="muted">{o.hint}</small>}
            </span>
            <input type="checkbox" role="switch" checked={!!settings[o.key]} onChange={(e) => update({ [o.key]: e.target.checked })} />
          </label>
        ))}
    </section>
  )
}

/** Clé The Odds API et choix du bookmaker pour les cotes françaises. */
function OddsSettingsCard() {
  const { settings, update } = useOddsSettings()
  const status = useOddsStatus()
  const [draft, setDraft] = useState(settings.apiKey)
  const [show, setShow] = useState(false)
  const active = !!settings.apiKey

  const save = () => {
    const apiKey = draft.trim()
    update({ apiKey })
    if (apiKey) refreshOdds(true)
  }
  const remove = () => {
    update({ apiKey: '' })
    setDraft('')
    forgetOddsCache()
  }

  return (
    <section className="card">
      <h3 className="card-title">Cotes des bookmakers français</h3>
      <p className="muted small">
        Sans réglage, l’app affiche les cotes DraftKings (États-Unis) converties au format européen. Avec une clé
        gratuite <a href="https://the-odds-api.com/#get-access" target="_blank" rel="noreferrer">The Odds API</a>{' '}
        (500 crédits par mois), elle affiche les vraies cotes de Winamax, Betclic, Unibet, PMU ou NetBet.
      </p>
      <div className="key-row">
        <input
          className="search"
          type={show ? 'text' : 'password'}
          placeholder="Collez votre clé API"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="chip" onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? 'Masquer' : 'Afficher'}
        </button>
      </div>
      <div className="key-actions">
        <button className="btn" onClick={save} disabled={!draft.trim() || (draft.trim() === settings.apiKey && !status.error)}>
          Enregistrer
        </button>
        {active && (
          <button className="link-btn" onClick={remove}>
            Supprimer la clé
          </button>
        )}
      </div>

      {active && (
        <>
          <label className="switch-row">
            <span>Bookmaker affiché</span>
            <select className="select" value={settings.bookmaker} onChange={(e) => update({ bookmaker: e.target.value })}>
              {BOOKMAKERS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.name}
                </option>
              ))}
              <option value="best">Meilleure cote</option>
            </select>
          </label>
          <div className="odds-status">
            {status.loading ? (
              <span className="muted">Chargement des cotes…</span>
            ) : status.error ? (
              <span className="warn">{status.error}</span>
            ) : status.fetchedAt ? (
              <span className="muted">
                {status.events.length} match{status.events.length > 1 ? 's' : ''} · mis à jour {timeAgo(new Date(status.fetchedAt).toISOString())}
                {status.remaining != null && ` · ${status.remaining} crédits restants`}
              </span>
            ) : null}
            <button className="link-btn" onClick={() => refreshOdds(true)} disabled={status.loading}>
              Actualiser ({CREDITS_PER_REFRESH} crédits)
            </button>
          </div>
          <p className="muted small">Les cotes sont gardées 6 h pour ménager les crédits gratuits.</p>
        </>
      )}
    </section>
  )
}
