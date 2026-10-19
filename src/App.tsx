import { useEffect, useState, type ReactNode } from 'react'
import { Alerts } from './components/Alerts'
import { href, TABS, useRoute, type TabName } from './lib/router'
import { GamePage } from './pages/GamePage'
import { LeadersPage } from './pages/LeadersPage'
import { NewsPage } from './pages/NewsPage'
import { PlayerPage } from './pages/PlayerPage'
import { ScoresPage } from './pages/ScoresPage'
import { StandingsPage } from './pages/StandingsPage'
import { TeamPage } from './pages/TeamPage'
import { TeamsPage } from './pages/TeamsPage'

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const TAB_META: Record<TabName, { label: string; icon: ReactNode }> = {
  scores: {
    label: 'Scores',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5v17M6.2 5.8c2.3 2.2 3.5 4 3.5 6.2s-1.2 4-3.5 6.2M17.8 5.8c-2.3 2.2-3.5 4-3.5 6.2s1.2 4 3.5 6.2" />
      </>,
    ),
  },
  teams: {
    label: 'Mes équipes',
    icon: icon(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />),
  },
  standings: {
    label: 'Classement',
    icon: icon(<path d="M4 6h16M4 12h16M4 18h16M8 3v18" />),
  },
  leaders: {
    label: 'Leaders',
    icon: icon(<path d="M5 20V12M10 20V6M15 20v-9M20 20V9M3 20.5h18" />),
  },
  news: {
    label: 'Actus',
    icon: icon(
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M7 9h10M7 12.5h10M7 16h6" />
      </>,
    ),
  },
}

function TabPage({ tab, active }: { tab: TabName; active: boolean }) {
  switch (tab) {
    case 'scores':
      return <ScoresPage active={active} />
    case 'teams':
      return <TeamsPage active={active} />
    case 'standings':
      return <StandingsPage active={active} />
    case 'leaders':
      return <LeadersPage active={active} />
    case 'news':
      return <NewsPage active={active} />
  }
}

export function App() {
  const route = useRoute()
  const isTab = (TABS as readonly string[]).includes(route.name)
  const [lastTab, setLastTab] = useState<TabName>('scores')
  // Les onglets déjà visités restent montés : on retrouve sa position et sa date en revenant.
  const [visited, setVisited] = useState<Set<TabName>>(() => new Set(['scores']))

  useEffect(() => {
    if (!isTab) return
    const t = route.name as TabName
    setLastTab(t)
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)))
  }, [route.name, isTab])

  const currentTab = isTab ? (route.name as TabName) : lastTab

  return (
    <div className="app">
      <Alerts />
      <main className="views">
        {TABS.filter((t) => visited.has(t) || t === currentTab).map((t) => {
          const shown = isTab && t === currentTab
          return (
            <div key={t} className="view" aria-hidden={!shown} inert={!shown}>
              <TabPage tab={t} active={shown} />
            </div>
          )
        })}
        {route.name === 'game' && (
          <div key={`game-${route.id}`} className="view detail">
            <GamePage id={route.id} />
          </div>
        )}
        {route.name === 'team' && (
          <div key={`team-${route.id}`} className="view detail">
            <TeamPage id={route.id} />
          </div>
        )}
        {route.name === 'player' && (
          <div key={`player-${route.id}`} className="view detail">
            <PlayerPage id={route.id} />
          </div>
        )}
      </main>
      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map((t) => (
          <a key={t} href={href.tab(t)} className={t === currentTab ? 'active' : ''} aria-current={t === currentTab && isTab ? 'page' : undefined}>
            {TAB_META[t].icon}
            <span>{TAB_META[t].label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
