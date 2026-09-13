import { createHash } from 'node:crypto'
import type { CollectedTopic, IdentityKind, TopicIdentity } from './types.ts'

const DEDUPE_VERSION = 1 as const
const TRACKING_PARAMETERS = new Set(['fbclid', 'gclid', 'spm', 'from', 'source'])

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')
}

/** 将 HTTP(S) 原文地址规范化为稳定去重输入。 */
export function normalizeUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('话题 URL 必须使用 HTTP(S)')
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key)
    }
  }
  url.searchParams.sort()
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

/** 生成版本化、平台隔离且可审计的 SHA-256 联合哈希。 */
export function identifyTopic(topic: CollectedTopic): TopicIdentity {
  let kind: IdentityKind
  let sourceKey: string
  const stableId = topic.stableId === undefined ? '' : normalizedText(topic.stableId)
  if (stableId !== '') {
    kind = 'stable_id'
    sourceKey = stableId
  } else {
    try {
      kind = 'url'
      sourceKey = normalizeUrl(topic.url)
    } catch {
      kind = 'title'
      sourceKey = normalizedText(topic.title)
    }
  }
  if (sourceKey === '') throw new TypeError('话题稳定身份不能为空')
  const input = `v${DEDUPE_VERSION}\0${topic.platformCode}\0${kind}\0${sourceKey}`
  return {
    kind,
    sourceKey,
    version: DEDUPE_VERSION,
    hash: createHash('sha256').update(input, 'utf8').digest(),
  }
}
