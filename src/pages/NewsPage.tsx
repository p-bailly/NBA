import { fetchNews } from '../api/espn'
import { ErrorBox, Loading, PageHeader } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { timeAgo } from '../lib/format'

export function NewsPage({ active }: { active: boolean }) {
  const { data, error, refresh } = usePolling((s) => fetchNews(s), [], 10 * 60_000, active)

  return (
    <>
      <PageHeader title="Actus" subtitle="Les dernières infos NBA (ESPN, en anglais)" />
      <div className="content">
        {error && !data && <ErrorBox error={error} onRetry={refresh} />}
        {!data && !error && <Loading />}
        <ul className="news-list">
          {data?.map((a) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer" className="news-item">
                {a.image && <img src={a.image} alt="" loading="lazy" />}
                <span className="news-text">
                  <strong>{a.headline}</strong>
                  <span className="muted">{a.description}</span>
                  <small className="muted">{timeAgo(a.published)}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
