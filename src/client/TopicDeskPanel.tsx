import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isEnglishTitle } from '../types.ts'
import type {
  CreationQueueRequest, CreationQueueResult, PlatformCode, RefreshResult, SourceRegion, TopicCategory, TopicPage,
  TopicQuery, TopicView, TranslationRequest, TranslationResult,
} from '../types.ts'
import styles from './topic-desk.module.css'

const PAGE_SIZE = 20
type ViewMode = 'discover' | 'queue' | 'new'

export interface TopicDeskActions {
  readonly list: (query: TopicQuery) => Promise<TopicPage>
  readonly refresh: () => Promise<RefreshResult>
  readonly translate: (request: TranslationRequest) => Promise<TranslationResult>
  readonly queue: (request: CreationQueueRequest) => Promise<CreationQueueResult>
  readonly unqueue: (request: CreationQueueRequest) => Promise<CreationQueueResult>
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
export function TopicDeskPanel({ list, refresh, translate, queue, unqueue, t }: PanelProps) {
  const [view, setView] = useState<ViewMode>('discover')
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
  const [refreshResult, setRefreshResult] = useState<RefreshResult>()
  const [insertedTopicIds, setInsertedTopicIds] = useState<readonly number[]>([])
  const [queuedTotal, setQueuedTotal] = useState(0)
  const [queueing, setQueueing] = useState<Record<number, boolean>>({})
  const [translations, setTranslations] = useState<Record<number, { text?: string; error?: string; loading?: boolean }>>({})
  const request = useRef(0)

  const load = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    setError(undefined)
    try {
      const next = await list({
        ...(view === 'discover' && source !== undefined ? { source } : {}),
        ...(view === 'discover' && region !== 'all' ? { region } : {}),
        ...(view === 'discover' && category !== 'all' ? { category } : {}),
        ...(view === 'queue' ? { queuedOnly: true } : {}),
        ...(view === 'new' ? { topicIds: insertedTopicIds } : {}),
        search,
        ...(view === 'discover' ? { sort } : {}),
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      })
      if (id === request.current) {
        setQueuedTotal(next.queuedTotal)
        if (next.total > 0 && pageIndex * PAGE_SIZE >= next.total) setPageIndex(Math.ceil(next.total / PAGE_SIZE) - 1)
        else setPage(next)
      }
    } catch (reason) {
      if (id === request.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [category, insertedTopicIds, list, pageIndex, region, search, sort, source, view])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 180)
    return () => { window.clearTimeout(timer) }
  }, [load])

  const collect = async (): Promise<void> => {
    setRefreshing(true)
    setRefreshResult(undefined)
    setError(undefined)
    try {
      const result = await refresh()
      setRefreshResult(result)
      setInsertedTopicIds(result.insertedTopicIds)
      if (view === 'new') {
        setPageIndex(0)
        setPage(undefined)
      }
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRefreshing(false)
    }
  }

  const translateTopic = async (topic: TopicView): Promise<void> => {
    setTranslations(current => ({ ...current, [topic.id]: { loading: true } }))
    try {
      const result = await translate({ topicId: topic.id })
      setTranslations(current => ({ ...current, [topic.id]: { text: result.translation } }))
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setTranslations(current => ({ ...current, [topic.id]: { error: message } }))
    }
  }

  const switchView = (next: ViewMode): void => {
    if (next === view) return
    setView(next)
    setPageIndex(0)
    setSearch('')
    setPage(undefined)
    setError(undefined)
  }

  const changeQueue = async (topic: TopicView, queued: boolean): Promise<void> => {
    setQueueing(current => ({ ...current, [topic.id]: true }))
    setError(undefined)
    try {
      await (queued ? queue : unqueue)({ topicId: topic.id })
      if (queued) {
        setQueuedTotal(current => current + 1)
        setPage(current => current === undefined ? current : {
          ...current,
          queuedTotal: current.queuedTotal + 1,
          topics: current.topics.map(item => item.id === topic.id
            ? { ...item, queued: true, queuedAt: new Date().toISOString() }
            : item),
        })
      } else {
        await load()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setQueueing(current => ({ ...current, [topic.id]: false }))
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
        <div className={styles.refreshArea}>
          <button className={styles.refresh} type="button" disabled={refreshing} onClick={() => { void collect() }}>
            <RefreshIcon />
            {refreshing ? t('refreshing') : t('refresh')}
          </button>
          {refreshResult !== undefined ? (
            <span className={styles.refreshResult} role="status">
              {refreshResult.accepted ? (
                <>
                  {refreshResult.inserted === 0 ? t('refreshNoNew') : (
                    <button type="button" onClick={() => { switchView('new') }}>
                      {t('refreshAdded')} {refreshResult.inserted} {t('items')}
                    </button>
                  )}
                  <span> · {t('refreshUpdated')} {refreshResult.updated} {t('items')}</span>
                </>
              ) : refreshResult.message}
            </span>
          ) : null}
        </div>
      </header>

      <nav className={styles.viewTabs} aria-label={t('views')} role="tablist">
        <button type="button" role="tab" aria-selected={view === 'discover'} onClick={() => { switchView('discover') }}>
          <DiscoverIcon />
          <span>{t('discover')}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'queue'} onClick={() => { switchView('queue') }}>
          <BookmarkIcon filled={view === 'queue'} />
          <span>{t('creationQueue')}</span>
          <strong>{queuedTotal}</strong>
        </button>
        {insertedTopicIds.length > 0 || view === 'new' ? (
          <button type="button" role="tab" aria-selected={view === 'new'} onClick={() => { switchView('new') }}>
            <NewIcon />
            <span>{t('newTopics')}</span>
            <strong>{insertedTopicIds.length}</strong>
          </button>
        ) : null}
      </nav>

      {view === 'discover' ? <section className={styles.filters} aria-label={t('filters')}>
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
      </section> : null}

      {view === 'discover' ? <section className={styles.toolbar} aria-label={t('title')}>
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
      </section> : view === 'queue' ? (
        <section className={styles.queueToolbar} aria-label={t('creationQueue')}>
          <div>
            <strong>{t('queueTitle')}</strong>
            <span>{t('queueHint')}</span>
          </div>
          <label className={styles.search}>
            <SearchIcon />
            <input value={search} onChange={event => { setSearch(event.target.value); setPageIndex(0) }} placeholder={t('searchQueue')} />
          </label>
        </section>
      ) : (
        <section className={styles.queueToolbar} aria-label={t('newTopics')}>
          <div>
            <strong>{t('newTopicsTitle')}</strong>
            <span>{t('newTopicsHint')}</span>
          </div>
          <label className={styles.search}>
            <SearchIcon />
            <input value={search} onChange={event => { setSearch(event.target.value); setPageIndex(0) }} placeholder={t('searchNewTopics')} />
          </label>
        </section>
      )}

      <div className={styles.summary}>
        <span><strong>{page?.total ?? 0}</strong> {view === 'queue' ? t('queueResults') : view === 'new' ? t('newTopicResults') : t('results')}</span>
        {view === 'discover' ? <span className={hasIssue ? styles.issue : styles.healthy}>
          {hasIssue ? t('sourceIssue') : t('sourcesHealthy')}
        </span> : null}
        {page !== undefined && !page.historyEnabled && <span>{t('historyOff')}</span>}
      </div>

      {error !== undefined && (
        <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => { void load() }}>{t('retry')}</button></div>
      )}
      {loading && page === undefined ? <div className={styles.state}>{t('loading')}</div> : null}
      {!loading && page?.topics.length === 0 ? (
        <div className={styles.state}>
          <strong>{view === 'queue' ? t('queueEmpty') : view === 'new' ? t('newTopicsEmpty') : t('empty')}</strong>
          <span>{view === 'queue' ? t('queueEmptyHint') : view === 'new' ? t('newTopicsEmptyHint') : t('emptyHint')}</span>
        </div>
      ) : null}
      {page !== undefined && page.topics.length > 0 ? (
        <ol className={styles.list}>
          {page.topics.map(topic => {
            const translation = translations[topic.id]
            const showGlobalRank = source === undefined
            const visibleRank = showGlobalRank ? topic.globalRank : topic.rank
            return <li key={`${topic.platformCode}:${topic.id}`} className={styles.card}>
              <div className={styles.rank}>
                <span>{showGlobalRank ? t('globalRank') : t('platformRank')}</span>
                <strong>{String(visibleRank).padStart(2, '0')}</strong>
              </div>
              <div className={styles.topic}>
                <div className={styles.topicMeta}>
                  <span data-source={topic.platformCode}>{topic.platformName}</span>
                  <span className={styles.categoryBadge} data-category={topic.category}>{categoryLabel(topic.category, t)}</span>
                  <span>{t('firstSeen')} {formatTime(topic.firstSeenAt)}</span>
                </div>
                <a className={styles.topicTitle} href={topic.url} target="_blank" rel="noopener noreferrer" title={t('open')}>{topic.title}</a>
                {isEnglishTitle(topic.title) && (
                  <div className={styles.translationRow}>
                    <button
                      className={styles.translate}
                      type="button"
                      disabled={translation?.loading || translation?.text !== undefined}
                      aria-label={`${t('translate')}：${topic.title}`}
                      onClick={() => { void translateTopic(topic) }}
                    >
                      {t('translate')}
                    </button>
                    {translation?.loading && <span>：{t('translating')}</span>}
                    {translation?.text !== undefined && <span lang="zh-CN">：{translation.text}</span>}
                    {translation?.error !== undefined && <span className={styles.translationError}>：{translation.error}</span>}
                  </div>
                )}
                <div className={styles.metrics}>
                  {view === 'queue' && topic.queuedAt !== null ? <span className={styles.queuedDate}>{t('savedAt')} {formatTime(topic.queuedAt)}</span> : null}
                  <span className={topic.rankDelta !== null && topic.rankDelta > 0 ? styles.rising : undefined}>{deltaLabel(topic, t)}</span>
                  <span>{t('runs')} {topic.consecutiveRuns} {t('times')}</span>
                  <span>{t('updated')} {formatTime(topic.updatedAt)}</span>
                </div>
              </div>
              <div className={styles.trendCell}>
                <RankTrend values={topic.trend} label={`${topic.title} · ${t('trend')}`} />
                <span>{t('trend')}</span>
              </div>
              <div className={styles.actions}>
                <button
                  className={topic.queued ? styles.saved : styles.save}
                  type="button"
                  disabled={queueing[topic.id] === true}
                  aria-label={`${topic.queued ? t('removeFromQueue') : t('addToQueue')}：${topic.title}`}
                  onClick={() => { void changeQueue(topic, !topic.queued) }}
                >
                  <BookmarkIcon filled={topic.queued} />
                  <span>{topic.queued ? (view === 'queue' ? t('removeFromQueue') : t('queued')) : t('addToQueue')}</span>
                </button>
                <a className={styles.open} href={topic.url} target="_blank" rel="noopener noreferrer" aria-label={`${t('open')}：${topic.title}`}>
                  <ArrowIcon />
                </a>
              </div>
            </li>
          })}
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

function BookmarkIcon({ filled = false }: { readonly filled?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5h10v13l-5-3-5 3z" fill={filled ? 'currentColor' : 'none'} /></svg>
}

function DiscoverIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 1.7 5.2L17 9l-5.3 1.8L10 16l-1.7-5.2L3 9l5.3-1.8z" /></svg>
}

function NewIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14" /></svg>
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
