import { XMLParser } from 'fast-xml-parser'
import type { CollectedTopic, ParsedFeed, PlatformCode } from './types.ts'

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true, processEntities: true })

function text(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || undefined
  if (value !== null && typeof value === 'object' && '#text' in value) {
    return text((value as { '#text': unknown })['#text'])
  }
  return undefined
}

function itemList(document: unknown): unknown[] {
  if (document === null || typeof document !== 'object') return []
  const rdf = (document as Record<string, unknown>)['rdf:RDF'] ?? (document as Record<string, unknown>).RDF
  if (rdf !== null && typeof rdf === 'object') {
    const item = (rdf as Record<string, unknown>).item
    return Array.isArray(item) ? item : item === undefined ? [] : [item]
  }
  const feed = (document as Record<string, unknown>).feed
  if (feed !== null && typeof feed === 'object') {
    const entry = (feed as Record<string, unknown>).entry
    return Array.isArray(entry) ? entry : entry === undefined ? [] : [entry]
  }
  const rss = (document as Record<string, unknown>).rss
  if (rss === null || typeof rss !== 'object') return []
  const channel = (rss as Record<string, unknown>).channel
  if (channel === null || typeof channel !== 'object') return []
  const item = (channel as Record<string, unknown>).item
  return Array.isArray(item) ? item : item === undefined ? [] : [item]
}

function link(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const alternate = value.find(item => item !== null && typeof item === 'object' && (item as Record<string, unknown>)['@_rel'] !== 'self')
    return link(alternate ?? value[0])
  }
  if (value !== null && typeof value === 'object') return text((value as Record<string, unknown>)['@_href']) ?? text(value)
  return text(value)
}

function numericHeat(value: unknown): number | null {
  const raw = text(value)?.replace(/[,+]/g, '')
  if (raw === undefined) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function utcTime(value: unknown): string | undefined {
  const raw = text(value)
  if (raw === undefined) return undefined
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

/** 解析 RSS 或 Atom，仅保留榜单元数据。 */
export function parseRss(platformCode: PlatformCode, xml: string, limit: number): ParsedFeed {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('采集条数上限必须为正整数')
  const rawItems = itemList(parser.parse(xml)).slice(0, limit)
  const topics: CollectedTopic[] = []
  let invalidCount = 0
  for (const [index, value] of rawItems.entries()) {
    if (value === null || typeof value !== 'object') {
      invalidCount += 1
      continue
    }
    const item = value as Record<string, unknown>
    const title = text(item.title)
    const url = link(item.link)
    if (title === undefined || url === undefined) {
      invalidCount += 1
      continue
    }
    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('invalid protocol')
    } catch {
      invalidCount += 1
      continue
    }
    const stableId = text(item.guid) ?? text(item.id)
    const publishedTime = utcTime(item.pubDate) ?? utcTime(item.published) ?? utcTime(item.updated)
    topics.push({
      platformCode,
      ...(stableId === undefined ? {} : { stableId }),
      title,
      url,
      ...(publishedTime === undefined ? {} : { publishedTime }),
      rank: index + 1,
      heat: numericHeat(item['ht:approx_traffic']),
    })
  }
  return { topics, fetchedCount: rawItems.length, invalidCount }
}

/** 拉取并解析一份 RSS，支持调用方取消与配置化超时。 */
export async function fetchRss(
  platformCode: PlatformCode,
  feedUrl: string,
  limit: number,
  timeoutSeconds: number,
  userAgent: string,
  parentSignal?: AbortSignal,
): Promise<ParsedFeed> {
  const timeout = AbortSignal.timeout(timeoutSeconds * 1000)
  const signal = parentSignal === undefined ? timeout : AbortSignal.any([parentSignal, timeout])
  const response = await fetch(feedUrl, {
    headers: { accept: 'application/rss+xml, application/xml, text/xml;q=0.9', 'user-agent': userAgent },
    redirect: 'follow',
    signal,
  })
  if (!response.ok) throw new Error(`${platformCode} RSS 请求失败：HTTP ${response.status}`)
  return parseRss(platformCode, await response.text(), limit)
}
