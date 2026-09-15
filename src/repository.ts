import type { StatementResultingChanges } from 'node:sqlite'
import type { Config } from './config.ts'
import { TopicDatabase } from './database.ts'
import { identifyTopic } from './identity.ts'
import { platformCatalog, platformCategory, platformRegion } from './platforms.ts'
import type {
  CollectedTopic, ParsedFeed, PlatformDefinition, PlatformStatusView, TopicPage, TopicQuery, TopicView, TriggerKind,
} from './types.ts'

interface PlatformRow { id: number; code: string }
interface ExistingTopicRow { id: number; source_key: string; identity_kind: string }
interface TopicSqlRow {
  id: number
  platform_code: string
  platform_name: string
  title: string
  canonical_url: string
  published_time: string | null
  rank: number
  heat: number | null
  create_time: string
  update_time: string
}

function now(): string {
  return new Date().toISOString()
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (cause !== null && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string') {
    return `${error.message} (${cause.code})`
  }
  return error.message
}

/** Topic Desk 的全部领域 SQL；页面和采集器均通过此仓储访问数据库。 */
export class TopicRepository {
  constructor(
    private readonly database: TopicDatabase,
    private readonly historyEnabled: boolean,
  ) {}

  ensurePlatforms(definitions: readonly PlatformDefinition[]): void {
    const statement = this.database.handle.prepare(`
      INSERT INTO platform (code, display_name, home_url, feed_url, enabled, update_time)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        display_name = excluded.display_name,
        home_url = excluded.home_url,
        feed_url = excluded.feed_url,
        enabled = excluded.enabled,
        deleted = 0,
        update_time = excluded.update_time
    `)
    const timestamp = now()
    for (const source of definitions) {
      statement.run(source.code, source.displayName, source.homeUrl, source.feedUrl, source.enabled ? 1 : 0, timestamp)
    }
  }

  enabledPlatforms(): PlatformDefinition[] {
    return (this.database.handle.prepare(`
      SELECT code, display_name, home_url, feed_url, enabled
      FROM platform WHERE deleted = 0 AND enabled != 0 ORDER BY id
    `).all() as Array<Record<string, string | number>>).map(row => ({
      code: row.code as PlatformDefinition['code'],
      displayName: String(row.display_name),
      homeUrl: String(row.home_url),
      feedUrl: String(row.feed_url),
      enabled: Number(row.enabled) !== 0,
    }))
  }

  private platform(code: string): PlatformRow {
    const row = this.database.handle.prepare(
      'SELECT id, code FROM platform WHERE code = ? AND deleted = 0',
    ).get(code) as PlatformRow | undefined
    if (row === undefined) throw new Error(`未注册的平台：${code}`)
    return row
  }

  createRun(code: string, trigger: TriggerKind, status: 'running' | 'skipped', reason?: string): number {
    const platform = this.platform(code)
    const timestamp = now()
    const terminal = status === 'skipped' ? timestamp : null
    const result = this.database.handle.prepare(`
      INSERT INTO collection_run (
        platform_id, status, trigger_kind, scheduled_time, start_time, end_time, error_message, update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(platform.id, status, trigger, timestamp, status === 'running' ? timestamp : null, terminal, reason ?? null, timestamp)
    return Number(result.lastInsertRowid)
  }

  failRun(runId: number, error: unknown): void {
    const timestamp = now()
    this.database.handle.prepare(`
      UPDATE collection_run SET status = 'failed', end_time = ?, error_message = ?, update_time = ? WHERE id = ?
    `).run(timestamp, errorText(error), timestamp, runId)
  }

  commitFeed(code: string, runId: number, feed: ParsedFeed): { inserted: number; updated: number } {
    const platform = this.platform(code)
    return this.database.transaction(() => {
      const run = this.database.handle.prepare(`
        SELECT id FROM collection_run
        WHERE id = ? AND platform_id = ? AND status = 'running' AND deleted = 0
      `).get(runId, platform.id)
      if (run === undefined) throw new Error(`采集运行不属于平台或状态无效：${code}/${runId}`)

      let inserted = 0
      let updated = 0
      const find = this.database.handle.prepare(`
        SELECT id, source_key, identity_kind FROM topic WHERE platform_id = ? AND dedupe_hash = ?
      `)
      const insert = this.database.handle.prepare(`
        INSERT INTO topic (
          platform_id, source_key, identity_kind, dedupe_version, dedupe_hash,
          title, canonical_url, published_time, rank, heat, last_collection_run_id,
          create_time, update_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const update = this.database.handle.prepare(`
        UPDATE topic SET rank = ?, heat = ?, last_collection_run_id = ?, deleted = 0, update_time = ? WHERE id = ?
      `)
      const observe = this.database.handle.prepare(`
        INSERT INTO topic_observation (topic_id, collection_run_id, rank, heat, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(collection_run_id, topic_id) DO UPDATE SET
          rank = excluded.rank, heat = excluded.heat, deleted = 0, update_time = excluded.update_time
      `)
      const timestamp = now()
      for (const topic of feed.topics) {
        const identity = identifyTopic(topic)
        const hash = Buffer.from(identity.hash)
        const existing = find.get(platform.id, hash) as ExistingTopicRow | undefined
        let topicId: number
        if (existing === undefined) {
          const result = insert.run(
            platform.id, identity.sourceKey, identity.kind, identity.version, hash,
            topic.title, topic.url, topic.publishedTime ?? null, topic.rank, topic.heat,
            runId, timestamp, timestamp,
          )
          topicId = Number(result.lastInsertRowid)
          inserted += 1
        } else {
          if (existing.source_key !== identity.sourceKey || existing.identity_kind !== identity.kind) {
            throw new Error(`检测到去重哈希冲突：${code}/${identity.sourceKey}`)
          }
          update.run(topic.rank, topic.heat, runId, timestamp, existing.id)
          topicId = existing.id
          updated += 1
        }
        if (this.historyEnabled) observe.run(topicId, runId, topic.rank, topic.heat, timestamp, timestamp)
      }
      this.database.handle.prepare(`
        UPDATE collection_run SET status = 'succeeded', end_time = ?, fetched_count = ?, inserted_count = ?,
          updated_count = ?, invalid_count = ?, error_message = NULL, update_time = ? WHERE id = ?
      `).run(timestamp, feed.fetchedCount, inserted, updated, feed.invalidCount, timestamp, runId)
      this.database.handle.prepare(
        'UPDATE platform SET last_success_run_id = ?, update_time = ? WHERE id = ?',
      ).run(runId, timestamp, platform.id)
      return { inserted, updated }
    })
  }

  cleanObservations(retentionDays: number): number {
    if (retentionDays === 0) return 0
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
    const result = this.database.handle.prepare(
      'DELETE FROM topic_observation WHERE create_time < ?',
    ).run(cutoff) as StatementResultingChanges
    return Number(result.changes)
  }

  list(query: TopicQuery = {}): TopicPage {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100)
    const offset = Math.max(query.offset ?? 0, 0)
    const where = ['t.deleted = 0', 'p.deleted = 0', 'p.last_success_run_id = t.last_collection_run_id']
    const args: Array<string | number> = []
    if (query.source !== undefined) {
      where.push('p.code = ?')
      args.push(query.source)
    }
    if (query.region !== undefined) {
      const codes = platformCatalog.filter(platform => platformRegion(platform.code) === query.region).map(platform => platform.code)
      where.push(`p.code IN (${codes.map(() => '?').join(', ')})`)
      args.push(...codes)
    }
    if (query.category !== undefined) {
      const codes = platformCatalog.filter(platform => platformCategory(platform.code) === query.category).map(platform => platform.code)
      where.push(`p.code IN (${codes.map(() => '?').join(', ')})`)
      args.push(...codes)
    }
    const search = query.search?.trim()
    if (search !== undefined && search !== '') {
      where.push("t.title LIKE ? ESCAPE '\\'")
      args.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`)
    }
    const order = query.sort === 'updated'
      ? 't.update_time DESC, t.id DESC'
      : 't.rank ASC, p.code ASC, t.id ASC'
    const clause = where.join(' AND ')
    const total = this.database.handle.prepare(`
      SELECT COUNT(*) AS count FROM topic t JOIN platform p ON p.id = t.platform_id WHERE ${clause}
    `).get(...args) as { count: number }
    const rows = this.database.handle.prepare(`
      SELECT t.id, p.code AS platform_code, p.display_name AS platform_name, t.title,
        t.canonical_url, t.published_time, t.rank, t.heat, t.create_time, t.update_time
      FROM topic t JOIN platform p ON p.id = t.platform_id
      WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?
    `).all(...args, limit, offset) as unknown as TopicSqlRow[]
    return {
      topics: rows.map(row => this.toView(row)),
      total: total.count,
      statuses: this.statuses(),
      historyEnabled: this.historyEnabled,
    }
  }

  /** 读取仍属于当前成功榜单的一条标题，供 Host 侧按需翻译使用。 */
  topicTitle(topicId: number): string | undefined {
    const row = this.database.handle.prepare(`
      SELECT t.title FROM topic t JOIN platform p ON p.id = t.platform_id
      WHERE t.id = ? AND t.deleted = 0 AND p.deleted = 0
        AND p.last_success_run_id = t.last_collection_run_id
    `).get(topicId) as { title: string } | undefined
    return row?.title
  }

  private toView(row: TopicSqlRow): TopicView {
    const observations = this.database.handle.prepare(`
      SELECT rank FROM topic_observation WHERE topic_id = ? AND deleted = 0
      ORDER BY create_time DESC, id DESC LIMIT 12
    `).all(row.id) as unknown as Array<{ rank: number }>
    const trend = observations.map(item => item.rank).reverse()
    const previous = observations[1]?.rank
    const rankDelta = previous === undefined ? null : previous - row.rank
    return {
      id: row.id,
      platformCode: row.platform_code,
      platformName: row.platform_name,
      category: platformCategory(row.platform_code),
      title: row.title,
      url: row.canonical_url,
      publishedTime: row.published_time,
      rank: row.rank,
      heat: row.heat,
      firstSeenAt: row.create_time,
      updatedAt: row.update_time,
      rankDelta,
      consecutiveRuns: this.consecutiveRuns(row.id, row.platform_code),
      trend,
    }
  }

  private consecutiveRuns(topicId: number, platformCode: string): number {
    const rows = this.database.handle.prepare(`
      SELECT cr.id, EXISTS(
        SELECT 1 FROM topic_observation o WHERE o.collection_run_id = cr.id AND o.topic_id = ? AND o.deleted = 0
      ) AS present
      FROM collection_run cr JOIN platform p ON p.id = cr.platform_id
      WHERE p.code = ? AND cr.status = 'succeeded' AND cr.deleted = 0
      ORDER BY cr.end_time DESC, cr.id DESC LIMIT 100
    `).all(topicId, platformCode) as unknown as Array<{ present: number }>
    let count = 0
    for (const row of rows) {
      if (row.present === 0) break
      count += 1
    }
    return count
  }

  statuses(): PlatformStatusView[] {
    return (this.database.handle.prepare(`
      SELECT p.code, p.display_name, p.enabled,
        (SELECT cr.status FROM collection_run cr WHERE cr.platform_id = p.id AND cr.deleted = 0 ORDER BY cr.id DESC LIMIT 1) AS status,
        (SELECT cr.end_time FROM collection_run cr WHERE cr.platform_id = p.id AND cr.deleted = 0 ORDER BY cr.id DESC LIMIT 1) AS last_run_at,
        (SELECT cr.error_message FROM collection_run cr WHERE cr.platform_id = p.id AND cr.deleted = 0 ORDER BY cr.id DESC LIMIT 1) AS error,
        (SELECT COUNT(*) FROM topic t WHERE t.platform_id = p.id AND t.deleted = 0
          AND p.last_success_run_id = t.last_collection_run_id) AS topic_count
      FROM platform p WHERE p.deleted = 0 ORDER BY p.id
    `).all() as unknown as Array<Record<string, string | number | null>>).map(row => ({
      code: String(row.code),
      displayName: String(row.display_name),
      region: platformRegion(String(row.code)),
      category: platformCategory(String(row.code)),
      enabled: Number(row.enabled) !== 0,
      status: row.status === null ? null : String(row.status),
      lastRunAt: row.last_run_at === null ? null : String(row.last_run_at),
      error: row.error === null ? null : String(row.error),
      topicCount: Number(row.topic_count),
    }))
  }
}

/** 仅供测试与 Demo 构造确定性话题。 */
export function topicFixture(overrides: Partial<CollectedTopic> = {}): CollectedTopic {
  return {
    platformCode: 'qbitai',
    stableId: 'fixture-1',
    title: '示例话题',
    url: 'https://www.qbitai.com/fixture.html',
    rank: 1,
    heat: null,
    ...overrides,
  }
}

/** 让配置类型在生成声明中保持可追踪。 */
export type RepositoryConfig = Pick<Config, 'historyEnabled' | 'historyRetentionDays'>
