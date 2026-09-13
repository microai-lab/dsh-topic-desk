import { type Dispatcher, ProxyAgent } from 'undici'
import { parseRss } from './rss.ts'
import type { CollectedTopic, ParsedFeed, PlatformCode } from './types.ts'

const HTML_SOURCES = new Set<PlatformCode>([
  '36kr', 'huxiu', 'c114', 'wallstreetcn', 'odaily', 'xueqiu', 'thepaper', 'github',
])

const FALLBACK_ENDPOINTS: Partial<Record<PlatformCode, readonly string[]>> = {
  '36kr': ['https://news.orz.ai/api/v1/dailynews/?platform=36kr'],
  'xueqiu': ['https://news.orz.ai/api/v1/dailynews/?platform=xueqiu'],
  'zhihu': ['https://news.orz.ai/api/v1/dailynews/?platform=zhihu'],
}

const proxyAgents = new Map<string, ProxyAgent>()
const browserUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0 Safari/537.36'

interface RequestOptions {
  readonly timeoutSeconds: number
  readonly userAgent: string
  readonly proxyUrl?: string
  readonly parentSignal?: AbortSignal
  readonly headers?: Record<string, string>
}

const HTML_PATHS: Partial<Record<PlatformCode, RegExp>> = {
  huxiu: /^\/article\/\d+/,
  c114: /\/a\d+\.html$/,
  wallstreetcn: /^\/(?:articles|livenews)\/\d+/,
  odaily: /^\/(?:zh-CN\/)?post\/\d+/,
  thepaper: /^\/newsDetail_forward_\d+/,
  github: /^\/[^/?#]+\/[^/?#]+\/?$/,
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : typeof value === 'number' ? String(value) : undefined
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(typeof value === 'string' ? value.replace(/[,+]/g, '') : Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function time(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString()
  const raw = string(value)
  if (raw === undefined) return undefined
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function plainText(value: unknown): string | undefined {
  const raw = string(value)
  if (raw === undefined) return undefined
  const output = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return output === '' ? undefined : output
}

function absoluteUrl(value: unknown, base: string): string | undefined {
  const raw = string(value)
  if (raw === undefined || raw.startsWith('#') || raw.startsWith('javascript:')) return undefined
  try {
    const url = new URL(raw, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function makeTopic(
  platformCode: PlatformCode,
  rank: number,
  candidate: { id?: unknown; title?: unknown; url?: unknown; published?: unknown; heat?: unknown },
  base: string,
): CollectedTopic | undefined {
  const fullTitle = plainText(candidate.title)
  const title = fullTitle !== undefined && fullTitle.length > 180
    ? `${fullTitle.slice(0, 177)}…`
    : fullTitle
  const url = absoluteUrl(candidate.url, base)
  if (title === undefined || url === undefined) return undefined
  const stableId = string(candidate.id)
  const publishedTime = time(candidate.published)
  return {
    platformCode,
    ...(stableId === undefined ? {} : { stableId }),
    title,
    url,
    ...(publishedTime === undefined ? {} : { publishedTime }),
    rank,
    heat: number(candidate.heat),
  }
}

function signal(timeoutSeconds: number, parentSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutSeconds * 1000)
  return parentSignal === undefined ? timeout : AbortSignal.any([parentSignal, timeout])
}

function proxyAgent(proxyUrl: string | undefined): Dispatcher | undefined {
  if (proxyUrl === undefined || proxyUrl === '') return undefined
  let agent = proxyAgents.get(proxyUrl)
  if (agent === undefined) {
    agent = new ProxyAgent(proxyUrl)
    proxyAgents.set(proxyUrl, agent)
  }
  return agent
}

function networkError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (cause !== null && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string') {
    return `${error.message} (${cause.code})`
  }
  return error.message
}

async function request(url: string, options: RequestOptions): Promise<Response> {
  const dispatcher = proxyAgent(options.proxyUrl)
  const attempts: Array<Dispatcher | undefined> = dispatcher === undefined ? [undefined] : [dispatcher, undefined]
  let lastError: unknown
  for (const currentDispatcher of attempts) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json, application/atom+xml, application/rss+xml, application/xml, text/html;q=0.8',
          'user-agent': options.userAgent,
          ...options.headers,
        },
        redirect: 'follow',
        signal: signal(options.timeoutSeconds, options.parentSignal),
        ...(currentDispatcher === undefined ? {} : { dispatcher: currentDispatcher }),
      } as RequestInit & { dispatcher?: Dispatcher })
      if (!response.ok) throw new Error(`${new URL(url).hostname} 请求失败：HTTP ${response.status}`)
      return response
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.message.includes('请求失败：HTTP')) throw error
      if (options.parentSignal?.aborted === true) throw error
    }
  }
  throw new Error(`${new URL(url).hostname} 连接失败：${networkError(lastError)}`, { cause: lastError })
}

function result(topics: Array<CollectedTopic | undefined>, fetchedCount = topics.length): ParsedFeed {
  const valid = topics.filter((topic): topic is CollectedTopic => topic !== undefined)
  return { topics: valid, fetchedCount, invalidCount: fetchedCount - valid.length }
}

export function parseHtmlLinks(platformCode: PlatformCode, html: string, base: string, limit: number): ParsedFeed {
  const candidates: CollectedTopic[] = []
  const seen = new Set<string>()
  const anchors = html.matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)
  for (const match of anchors) {
    const attributes = `${match[1] ?? ''} ${match[3] ?? ''}`
    const titleAttribute = /title=["']([^"']+)["']/i.exec(attributes)?.[1]
    const title = plainText(titleAttribute ?? match[4])
    const url = absoluteUrl(match[2], base)
    const acceptedPath = HTML_PATHS[platformCode]
    if (title === undefined || title.length < 6 || title.length > 180 || url === undefined || seen.has(url)) continue
    if (acceptedPath !== undefined && !acceptedPath.test(new URL(url).pathname)) continue
    seen.add(url)
    candidates.push({ platformCode, stableId: url, title, url, rank: candidates.length + 1, heat: null })
    if (candidates.length >= limit) break
  }
  return { topics: candidates, fetchedCount: candidates.length, invalidCount: 0 }
}

export function parseArxivHtml(html: string, base: string, limit: number): ParsedFeed {
  const topics: CollectedTopic[] = []
  const entries = html.matchAll(
    /<dt>[\s\S]*?<a\s+href\s*=\s*["'](\/abs\/[^"']+)["'][^>]*\bid=["']([^"']+)["'][\s\S]*?<\/dt>\s*<dd>[\s\S]*?<div\s+class=["']list-title\s+mathjax["'][^>]*>\s*<span[^>]*>[\s\S]*?<\/span>([\s\S]*?)<\/div>/gi,
  )
  for (const entry of entries) {
    const topic = makeTopic('arxiv', topics.length + 1, {
      id: entry[2],
      title: entry[3],
      url: entry[1],
    }, base)
    if (topic !== undefined) topics.push(topic)
    if (topics.length >= limit) break
  }
  return { topics, fetchedCount: topics.length, invalidCount: 0 }
}

export function parseXiaohongshuHtml(html: string, limit: number): ParsedFeed {
  const topics: CollectedTopic[] = []
  const seen = new Set<string>()
  const anchors = html.matchAll(
    /<a\b(?=[^>]*\bclass=["'][^"']*\btitle\b[^"']*["'])(?=[^>]*\bhref=["'][^"']*\/explore\/([a-f0-9]{24})[^"']*["'])[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/a>/gi,
  )
  for (const anchor of anchors) {
    const id = anchor[1]
    if (id === undefined || seen.has(id)) continue
    const topic = makeTopic('xiaohongshu', topics.length + 1, {
      id,
      title: anchor[2],
      url: `https://www.xiaohongshu.com/explore/${id}`,
    }, 'https://www.xiaohongshu.com/')
    if (topic !== undefined) {
      seen.add(id)
      topics.push(topic)
    }
    if (topics.length >= limit) break
  }
  return { topics, fetchedCount: topics.length, invalidCount: 0 }
}

function decodeHtml(response: Response, bytes: ArrayBuffer): string {
  const headerCharset = /charset=([^;\s]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]?.replace(/["']/g, '')
  const prefix = new TextDecoder('latin1').decode(bytes.slice(0, 2048))
  const documentCharset = /charset\s*=\s*["']?([^\s"';/>]+)/i.exec(prefix)?.[1]
  const charset = headerCharset ?? documentCharset
  const encoding = charset?.toLowerCase() === 'gb2312' || charset?.toLowerCase() === 'gbk' ? 'gb18030' : charset ?? 'utf-8'
  try {
    return new TextDecoder(encoding).decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

function requireTopics(platformCode: PlatformCode, feed: ParsedFeed): ParsedFeed {
  if (feed.topics.length === 0) throw new Error(`${platformCode} 未解析到有效热点`)
  return feed
}

async function fetchHackerNews(base: string, platformCode: PlatformCode, limit: number, options: RequestOptions): Promise<ParsedFeed> {
  const ids = array(await (await request(`${base}/topstories.json`, options)).json()).slice(0, limit)
  const items = await Promise.all(ids.map(id => request(`${base}/item/${id}.json`, options).then(response => response.json())))
  return result(items.map((value, index) => {
    const item = record(value)
    if (item === undefined) return undefined
    return makeTopic(platformCode, index + 1, {
      id: item.id, title: item.title, url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
      published: item.time, heat: item.score,
    }, base)
  }), ids.length)
}

function yesterday(): { year: string; month: string; day: string } {
  const date = new Date(Date.now() - 86_400_000)
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0'),
  }
}

async function fetchWikipedia(base: string, platformCode: PlatformCode, limit: number, options: RequestOptions): Promise<ParsedFeed> {
  const date = yesterday()
  const payload = record(await (await request(`${base}/${date.year}/${date.month}/${date.day}`, options)).json())
  const articles = array(record(array(payload?.items)[0])?.articles)
    .filter(value => {
      const article = string(record(value)?.article)
      return article !== undefined && article !== 'Main_Page' && !article.includes(':')
    })
    .slice(0, limit)
  const language = platformCode === 'wikipedia-zh' ? 'zh' : 'en'
  return result(articles.map((value, index) => {
    const item = record(value)
    return makeTopic(platformCode, index + 1, {
      id: item?.article, title: string(item?.article)?.replaceAll('_', ' '),
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(string(item?.article) ?? '')}`,
      heat: item?.views,
    }, base)
  }), articles.length)
}

export function parseJson(platformCode: PlatformCode, payload: unknown, endpoint: string, limit: number): ParsedFeed {
  let items: unknown[] = []
  let map: (value: unknown, index: number) => CollectedTopic | undefined
  if (new URL(endpoint).hostname === 'news.orz.ai') {
    items = array(record(payload)?.data).slice(0, limit)
    map = (value, index) => {
      const item = record(value)
      return makeTopic(platformCode, index + 1, {
        id: platformCode === 'cls' ? item?.title : item?.url,
        title: item?.title,
        url: item?.url,
        published: item?.publish_time,
        heat: item?.score ?? item?.rank,
      }, endpoint)
    }
  } else if (platformCode === 'toutiao') {
    items = array(record(payload)?.data).slice(0, limit)
    map = (value, index) => { const item = record(value); return makeTopic(platformCode, index + 1, { id: item?.ClusterIdStr, title: item?.Title, url: item?.Url, heat: item?.HotValue }, endpoint) }
  } else if (platformCode === 'zhihu') {
    items = array(record(payload)?.data).slice(0, limit)
    map = (value, index) => { const item = record(value); const target = record(item?.target); return makeTopic(platformCode, index + 1, { id: target?.id, title: target?.title, url: target?.url, heat: item?.detail_text }, endpoint) }
  } else if (platformCode === 'coingecko') {
    items = array(record(payload)?.coins).slice(0, limit)
    map = (value, index) => { const item = record(record(value)?.item); return makeTopic(platformCode, index + 1, { id: item?.id, title: `${string(item?.name) ?? ''} (${string(item?.symbol) ?? ''})`, url: `https://www.coingecko.com/en/coins/${string(item?.id) ?? ''}`, heat: item?.score }, endpoint) }
  } else if (platformCode === 'hugging-face') {
    items = array(payload).slice(0, limit)
    map = (value, index) => { const item = record(value); const paper = record(item?.paper) ?? item; return makeTopic(platformCode, index + 1, { id: paper?.id, title: paper?.title, url: `https://huggingface.co/papers/${string(paper?.id) ?? ''}`, published: paper?.publishedAt, heat: paper?.upvotes }, endpoint) }
  } else if (platformCode === 'bluesky') {
    items = array(record(payload)?.topics).slice(0, limit)
    map = (value, index) => { const item = record(value); const topic = string(item?.topic) ?? string(item?.displayName); return makeTopic(platformCode, index + 1, { id: topic, title: item?.displayName ?? topic, url: item?.link ?? `https://bsky.app/search?q=${encodeURIComponent(topic ?? '')}` }, endpoint) }
  } else if (platformCode === 'polymarket') {
    items = array(payload).slice(0, limit)
    map = (value, index) => { const item = record(value); return makeTopic(platformCode, index + 1, { id: item?.id ?? item?.conditionId, title: item?.question, url: `https://polymarket.com/event/${string(item?.slug) ?? ''}`, published: item?.createdAt, heat: item?.volume24hr }, endpoint) }
  } else if (platformCode === 'stack-overflow') {
    items = array(record(payload)?.items).slice(0, limit)
    map = (value, index) => { const item = record(value); return makeTopic(platformCode, index + 1, { id: item?.question_id, title: item?.title, url: item?.link, published: item?.creation_date, heat: item?.score }, endpoint) }
  } else if (platformCode === 'dev-community') {
    items = array(payload).slice(0, limit)
    map = (value, index) => { const item = record(value); return makeTopic(platformCode, index + 1, { id: item?.id, title: item?.title, url: item?.url, published: item?.published_at, heat: item?.positive_reactions_count }, endpoint) }
  } else if (platformCode === 'jin10') {
    items = array(record(payload)?.data).filter(value => record(record(value)?.extras)?.ad !== true).slice(0, limit)
    map = (value, index) => {
      const item = record(value)
      const data = record(item?.data)
      return makeTopic(platformCode, index + 1, {
        id: item?.id,
        title: string(data?.title) ?? data?.content,
        url: data?.link ?? 'https://www.jin10.com/flash',
        published: item?.time,
        heat: item?.important,
      }, endpoint)
    }
  } else if (platformCode === 'binance-square-zh' || platformCode === 'binance-square-global') {
    const allItems = array(record(record(payload)?.data)?.vos)
    const language = platformCode === 'binance-square-zh' ? 'zh-CN' : 'en'
    const matchingItems = allItems.filter(value => string(record(value)?.detectedLanguage) === language)
    items = (matchingItems.length === 0 ? allItems : matchingItems).slice(0, limit)
    map = (value, index) => {
      const item = record(value)
      return makeTopic(platformCode, index + 1, {
        id: item?.id,
        title: item?.title ?? item?.content,
        url: item?.webLink,
        published: item?.date,
        heat: item?.viewCount,
      }, endpoint)
    }
  } else if (platformCode === 'mastodon-zh') {
    items = array(payload).slice(0, limit)
    map = (value, index) => {
      const item = record(value)
      const heat = (number(item?.replies_count) ?? 0) + (number(item?.reblogs_count) ?? 0) + (number(item?.favourites_count) ?? 0)
      return makeTopic(platformCode, index + 1, {
        id: item?.id,
        title: item?.content,
        url: item?.url,
        published: item?.created_at,
        heat,
      }, endpoint)
    }
  } else if (platformCode === 'mastodon-global') {
    items = array(payload).slice(0, limit)
    map = (value, index) => { const item = record(value); return makeTopic(platformCode, index + 1, { id: item?.url, title: item?.title, url: item?.url, heat: array(item?.history).reduce<number>((sum, entry) => sum + (number(record(entry)?.uses) ?? 0), 0) }, endpoint) }
  } else {
    throw new Error(`没有 JSON 解析器：${platformCode}`)
  }
  return result(items.map(map), items.length)
}

function sourceOptions(platformCode: PlatformCode, options: RequestOptions): RequestOptions {
  if (platformCode === 'binance-square-zh' || platformCode === 'binance-square-global') {
    const language = platformCode === 'binance-square-zh' ? 'zh-CN' : 'en'
    const page = language === 'zh-CN' ? 'zh-CN' : 'en'
    return {
      ...options,
      userAgent: browserUserAgent,
      headers: {
        clienttype: 'web',
        lang: language,
        cookie: `lang=${language}`,
        referer: `https://www.binance.com/${page}/square/trending`,
      },
    }
  }
  if (platformCode === 'jin10') {
    return { ...options, headers: { 'x-app-id': 'bVBF4FyRTn5NJF5n', 'x-version': '1.0.0' } }
  }
  if (platformCode === 'xiaohongshu') return { ...options, userAgent: browserUserAgent }
  return options
}

async function fetchEndpoint(
  platformCode: PlatformCode,
  endpointUrl: string,
  limit: number,
  options: RequestOptions,
): Promise<ParsedFeed> {
  if (platformCode === 'hacker-news') return fetchHackerNews(endpointUrl, platformCode, limit, options)
  if (platformCode === 'wikipedia-zh' || platformCode === 'wikipedia-global') {
    return fetchWikipedia(endpointUrl, platformCode, limit, options)
  }
  const response = await request(endpointUrl, sourceOptions(platformCode, options))
  if (platformCode === 'arxiv') return parseArxivHtml(await response.text(), response.url, limit)
  if (platformCode === 'xiaohongshu') return parseXiaohongshuHtml(await response.text(), limit)
  if (HTML_SOURCES.has(platformCode) && new URL(response.url).hostname !== 'news.orz.ai') {
    const html = decodeHtml(response, await response.arrayBuffer())
    if (platformCode === 'github') {
      const rows = [...html.matchAll(/<article\b[^>]*class=["'][^"']*Box-row[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(match => match[1]).join('\n')
      return parseHtmlLinks(platformCode, rows || html, response.url, limit)
    }
    return parseHtmlLinks(platformCode, html, response.url, limit)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('json')) return parseJson(platformCode, await response.json(), response.url, limit)
  return parseRss(platformCode, await response.text(), limit)
}

/** 按平台协议拉取并标准化公开热点数据。 */
export async function fetchSource(
  platformCode: PlatformCode,
  endpointUrl: string,
  limit: number,
  timeoutSeconds: number,
  userAgent: string,
  proxyUrl = '',
  parentSignal?: AbortSignal,
): Promise<ParsedFeed> {
  const endpoints = [endpointUrl, ...(FALLBACK_ENDPOINTS[platformCode] ?? [])]
    .filter((endpoint, index, values) => values.indexOf(endpoint) === index)
  const errors: string[] = []
  for (const endpoint of endpoints) {
    try {
      return requireTopics(platformCode, await fetchEndpoint(platformCode, endpoint, limit, {
        timeoutSeconds,
        userAgent,
        proxyUrl,
        ...(parentSignal === undefined ? {} : { parentSignal }),
      }))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      if (parentSignal?.aborted === true) break
    }
  }
  throw new Error(errors.join('；'))
}
