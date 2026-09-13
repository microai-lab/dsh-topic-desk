import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlatformCode, RefreshResult, SourceRegion, TopicCategory, TopicPage, TopicQuery, TopicView } from '../types.ts'
import styles from './topic-desk.module.css'

const PAGE_SIZE = 20

export interface TopicDeskActions {
  readonly list: (query: TopicQuery) => Promise<TopicPage>
  readonly refresh: () => Promise<RefreshResult>
}

type PanelProps = TopicDeskActions & PropsLocale<'topic-desk'>

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function RankTrend({ values, label }: { readonly values: readonly number[]; readonly label: string }) {
  if (values.length < 2) return <span className={styles.trendEmpty}>—</span>
  const width = 104
  const height = 30
  const high = Math.max(...values)
  const low = Math.min(...values)
  const range = Math.max(high - low, 1)
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : index * width / (values.length - 1)
    const y = 3 + (value - low) / range * (height - 6)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className={styles.trend} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function deltaLabel(topic: TopicView, t: PanelProps['t']): string {
  if (topic.rankDelta === null || topic.rankDelta === 0) return t('flat')
  return `${topic.rankDelta > 0 ? t('up') : t('down')} ${Math.abs(topic.rankDelta)}`
}

function categoryLabel(category: TopicCategory, t: PanelProps['t']): string {
  if (category === 'technology') return t('technology')
  if (category === 'finance') return t('finance')
  if (category === 'developer') return t('developer')
  return t('general')
}

/** Topic Desk 的全局主面板；所有业务数据仅通过 Host Remote 从 SQLite 读取。 */
export function TopicDeskPanel({ list, refresh, t }: PanelProps) {
  const [region, setRegion] = useState<'all' | SourceRegion>('all')
  const [category, setCategory] = useState<'all' | TopicCategory>('all')
  const [source, setSource] = useState<PlatformCode | undefined>()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<NonNullable<TopicQuery['sort']>>('rank')
  const [pageIndex, setPageIndex] = useState(0)
  const [page, setPage] = useState<TopicPage>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const request = useRef(0)

  const load = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    setError(undefined)
    try {
      const next = await list({
        ...(source === undefined ? {} : { source }),
        ...(region === 'all' ? {} : { region }),
        ...(category === 'all' ? {} : { category }),
        search,
        sort,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      })
      if (id === request.current) {
        if (next.total > 0 && pageIndex * PAGE_SIZE >= next.total) setPageIndex(Math.ceil(next.total / PAGE_SIZE) - 1)
        else setPage(next)
      }
    } catch (reason) {
      if (id === request.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [category, list, pageIndex, region, search, sort, source])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 180)
    return () => { window.clearTimeout(timer) }
  }, [load])

  const collect = async (): Promise<void> => {
    setRefreshing(true)
    setError(undefined)
    try {
      await refresh()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRefreshing(false)
    }
  }

  const hasIssue = page?.statuses.some(status => status.enabled && status.status === 'failed') ?? false
  const visibleStatuses = page?.statuses.filter(status =>
    (region === 'all' || status.region === region) && (category === 'all' || status.category === category),
  ) ?? []
  const pageCount = Math.max(1, Math.ceil((page?.total ?? 0) / PAGE_SIZE))
  return (
    <main className={styles.panel}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}><span className={styles.liveDot} />{t('localData')}</div>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <button className={styles.refresh} type="button" disabled={refreshing} onClick={() => { void collect() }}>
          <RefreshIcon />
          {refreshing ? t('refreshing') : t('refresh')}
        </button>
      </header>

      <section className={styles.filters} aria-label={t('filters')}>
        <div className={styles.filterGroup} role="group" aria-label={t('regionFilter')}>
          <span>{t('region')}</span>
          {([
            ['all', t('all')],
            ['domestic', t('domestic')],
            ['international', t('international')],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={region === value} onClick={() => {
              setRegion(value)
              setSource(undefined)
              setPageIndex(0)
            }}>{label}</button>
          ))}
        </div>
        <div className={styles.filterGroup} role="group" aria-label={t('categoryFilter')}>
          <span>{t('topicCategory')}</span>
          {([
            ['all', t('allTopics')],
            ['general', t('general')],
            ['technology', t('technology')],
            ['finance', t('finance')],
            ['developer', t('developer')],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={category === value} onClick={() => {
              setCategory(value)
              setSource(undefined)
              setPageIndex(0)
            }}>{label}</button>
          ))}
        </div>
      </section>

      <section className={styles.toolbar} aria-label={t('title')}>
        <label className={styles.sourcePicker}>
          <SourceIcon />
          <span>{t('platform')}</span>
          <select
            aria-label={t('platformFilter')}
            value={source ?? ''}
            onChange={event => {
              setSource(event.target.value === '' ? undefined : event.target.value as PlatformCode)
              setPageIndex(0)
            }}
          >
            <option value="">{t('all')} · {page?.total ?? 0}</option>
            {visibleStatuses.map(status => (
              <option key={status.code} value={status.code}>{status.displayName} · {status.topicCount}</option>
            ))}
          </select>
        </label>
        <label className={styles.search}>
          <SearchIcon />
          <input value={search} onChange={event => { setSearch(event.target.value); setPageIndex(0) }} placeholder={t('search')} />
        </label>
        <select className={styles.sort} value={sort} onChange={event => { setSort(event.target.value as typeof sort); setPageIndex(0) }}>
          <option value="rank">{t('rankSort')}</option>
          <option value="updated">{t('updatedSort')}</option>
        </select>
      </section>

      <div className={styles.summary}>
        <span><strong>{page?.total ?? 0}</strong> {t('results')}</span>
        <span className={hasIssue ? styles.issue : styles.healthy}>
          {hasIssue ? t('sourceIssue') : t('sourcesHealthy')}
        </span>
        {page !== undefined && !page.historyEnabled && <span>{t('historyOff')}</span>}
      </div>

      {error !== undefined && (
        <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => { void load() }}>{t('retry')}</button></div>
      )}
      {loading && page === undefined ? <div className={styles.state}>{t('loading')}</div> : null}
      {!loading && page?.topics.length === 0 ? (
        <div className={styles.state}><strong>{t('empty')}</strong><span>{t('emptyHint')}</span></div>
      ) : null}
      {page !== undefined && page.topics.length > 0 ? (
        <ol className={styles.list}>
          {page.topics.map(topic => (
            <li key={`${topic.platformCode}:${topic.id}`} className={styles.card}>
              <div className={styles.rank}><span>{t('rank')}</span><strong>{String(topic.rank).padStart(2, '0')}</strong></div>
              <div className={styles.topic}>
                <div className={styles.topicMeta}>
                  <span data-source={topic.platformCode}>{topic.platformName}</span>
                  <span className={styles.categoryBadge}>{categoryLabel(topic.category, t)}</span>
                  <span>{t('firstSeen')} {formatTime(topic.firstSeenAt)}</span>
                </div>
                <a href={topic.url} target="_blank" rel="noopener noreferrer" title={t('open')}>{topic.title}</a>
                <div className={styles.metrics}>
                  <span className={topic.rankDelta !== null && topic.rankDelta > 0 ? styles.rising : undefined}>{deltaLabel(topic, t)}</span>
                  <span>{t('runs')} {topic.consecutiveRuns} {t('times')}</span>
                  <span>{t('updated')} {formatTime(topic.updatedAt)}</span>
                </div>
              </div>
              <div className={styles.trendCell}>
                <RankTrend values={topic.trend} label={`${topic.title} · ${t('trend')}`} />
                <span>{t('trend')}</span>
              </div>
              <a className={styles.open} href={topic.url} target="_blank" rel="noopener noreferrer" aria-label={`${t('open')}：${topic.title}`}>
                <ArrowIcon />
              </a>
            </li>
          ))}
        </ol>
      ) : null}
      {page !== undefined && page.total > PAGE_SIZE ? (
        <nav className={styles.pagination} aria-label={t('pagination')}>
          <button type="button" disabled={pageIndex === 0} onClick={() => { setPageIndex(value => Math.max(0, value - 1)) }}>{t('previous')}</button>
          <span>{t('page')} {pageIndex + 1} / {pageCount}</span>
          <button type="button" disabled={pageIndex + 1 >= pageCount} onClick={() => { setPageIndex(value => value + 1) }}>{t('next')}</button>
        </nav>
      ) : null}
    </main>
  )
}

function SearchIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
}

function SourceIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></svg>
}

function RefreshIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 6V2m0 0h-4m4 0-2.2 2.2A7 7 0 1 0 17 10" /></svg>
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 13 13 7m-5 0h5v5" /></svg>
}

export function TopicDeskIcon({ size, active }: { readonly size: number; readonly active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" data-active={active}>
      <rect x="2" y="2.5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="5" y="5.5" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 6h3M12 9h3M5 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
