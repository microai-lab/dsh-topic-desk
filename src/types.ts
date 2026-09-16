/** Topic Desk 支持的来源代码。 */
export const platformCodes = [
  'qbitai', 'ithome', '36kr', 'huxiu', 'c114', 'wallstreetcn', 'odaily', 'xueqiu', 'toutiao', 'thepaper',
  'zhihu', 'binance-square-zh', 'binance-square-global', 'hacker-news', 'wikipedia-zh', 'wikipedia-global',
  'mastodon-zh', 'mastodon-global', 'google-trends-zh', 'google-trends-global', 'coingecko', 'github',
  'hugging-face', 'arxiv', 'bluesky', 'polymarket', 'stack-overflow', 'dev-community', 'lobsters', 'techcrunch',
  'federal-reserve', 'sec', 'bbc-chinese', 'dw-chinese', 'rfi-chinese', 'bloomberg', 'jin10', 'cls',
  'xiaohongshu', 'weibo', 'douyin', 'bilibili', 'baidu', 'the-verge', 'ars-technica',
  'mit-technology-review', 'infoq', 'sspai', 'solidot',
] as const

export type PlatformCode = typeof platformCodes[number]

/** 来源所属地域，用于平台导航。 */
export type SourceRegion = 'domestic' | 'international'

/** 话题内容大类，用于缩小选题范围。 */
export type TopicCategory = 'general' | 'technology' | 'finance' | 'developer'

/** 一条来源条目采用的稳定身份类型。 */
export type IdentityKind = 'stable_id' | 'url' | 'title'

/** 采集触发原因。 */
export type TriggerKind = 'startup' | 'schedule' | 'manual'

/** 仅为含拉丁字母且不含中日韩文字的标题提供翻译入口。 */
export function isEnglishTitle(title: string): boolean {
  return /[A-Za-z]/.test(title) && !/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(title)
}

/** 标准化但尚未持久化的热点元数据。 */
export interface CollectedTopic {
  readonly platformCode: PlatformCode
  readonly stableId?: string
  readonly title: string
  readonly url: string
  readonly publishedTime?: string
  readonly rank: number
  readonly heat: number | null
}

/** 一次 Feed 解析的有效条目与诊断计数。 */
export interface ParsedFeed {
  readonly topics: CollectedTopic[]
  /** 进入平台条数上限窗口的原始条目数，包含随后判无效的条目。 */
  readonly fetchedCount: number
  readonly invalidCount: number
}

/** 平台定义及其采集入口。 */
export interface PlatformDefinition {
  readonly code: PlatformCode
  readonly displayName: string
  readonly homeUrl: string
  readonly feedUrl: string
  readonly enabled: boolean
}

/** 去重身份的可审计结果。 */
export interface TopicIdentity {
  readonly kind: IdentityKind
  readonly sourceKey: string
  readonly version: 1
  readonly hash: Uint8Array
}

/** 页面展示的一条当前话题。 */
export interface TopicView {
  readonly id: number
  readonly platformCode: string
  readonly platformName: string
  readonly category: TopicCategory
  readonly title: string
  readonly url: string
  readonly publishedTime: string | null
  /** 当前筛选范围内按平台榜单名次合并后的连续总排名。 */
  readonly globalRank: number
  /** 来源平台提供的原始榜单名次。 */
  readonly rank: number
  readonly heat: number | null
  readonly firstSeenAt: string
  readonly updatedAt: string
  readonly rankDelta: number | null
  readonly consecutiveRuns: number
  readonly trend: number[]
  readonly queued: boolean
  readonly queuedAt: string | null
}

/** 页面展示的平台最近运行状态。 */
export interface PlatformStatusView {
  readonly code: string
  readonly displayName: string
  readonly region: SourceRegion
  readonly category: TopicCategory
  readonly enabled: boolean
  readonly status: string | null
  readonly lastRunAt: string | null
  readonly error: string | null
  readonly topicCount: number
}

/** Topic Desk 榜单查询。 */
export interface TopicQuery {
  readonly source?: PlatformCode
  readonly region?: SourceRegion
  readonly category?: TopicCategory
  readonly search?: string
  readonly sort?: 'rank' | 'updated'
  readonly queuedOnly?: boolean
  readonly limit?: number
  readonly offset?: number
}

/** Topic Desk 榜单响应。 */
export interface TopicPage {
  readonly topics: TopicView[]
  readonly total: number
  readonly statuses: PlatformStatusView[]
  readonly historyEnabled: boolean
  readonly queuedTotal: number
}

/** 手动刷新结果。 */
export interface RefreshResult {
  readonly accepted: boolean
  readonly message: string
  readonly inserted: number
  readonly updated: number
}

/** 按需翻译请求；Host 会根据 ID 从本地数据库重新读取标题。 */
export interface TranslationRequest {
  readonly topicId: number
}

/** 一条由 Harness 当前默认模型生成的标题译文。 */
export interface TranslationResult {
  readonly topicId: number
  readonly translation: string
}

/** 将话题加入或移出待创作列表。 */
export interface CreationQueueRequest {
  readonly topicId: number
}

/** 待创作状态变更结果。 */
export interface CreationQueueResult {
  readonly topicId: number
  readonly queued: boolean
}
