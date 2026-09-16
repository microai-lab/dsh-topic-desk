import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { Config, defaultSourceConfigs, platformDefinitions } from '../src/config.ts'
import { CollectionCoordinator } from '../src/coordinator.ts'
import { TopicDatabase } from '../src/database.ts'
import { identifyTopic } from '../src/identity.ts'
import { platformCatalog } from '../src/platforms.ts'
import { TopicRepository, topicFixture } from '../src/repository.ts'
import { isEnglishTitle, TopicTranslator } from '../src/translator.ts'
import { parseRss } from '../src/rss.ts'
import { parseArxivHtml, parseHtmlLinks, parseJson, parseXiaohongshuHtml } from '../src/source-fetcher.ts'

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('配置', () => {
  it('使用产品默认值并拒绝无效范围', () => {
    const config = Config({})
    expect(config.databasePath).toBe('./data/topic-desk.sqlite')
    expect(config.collectionIntervalMinutes).toBe(10)
    expect(config.itemsPerPlatform).toBe(30)
    expect(config.historyEnabled).toBe(true)
    expect(config.historyRetentionDays).toBe(30)
    expect(config.proxyUrl).toBe('http://127.0.0.1:7897')
    expect(config.sources.qbitai?.enabled).toBe(true)
    expect(config.sources.ithome?.enabled).toBe(true)
    expect(platformDefinitions(config)).toHaveLength(49)
    expect(platformCatalog.map(platform => platform.displayName)).toEqual(expect.arrayContaining([
      '36氪', '虎嗅', 'C114通信', '华尔街见闻', 'Odaily星球日报', '雪球', '今日头条', '澎湃新闻', '知乎',
      '币安广场中文', '币安广场全球', 'Hacker News', 'Wikipedia 中文', 'Wikipedia 全球', 'Mastodon 中文',
      'Mastodon 全球', 'Google Trends 中文', 'Google Trends 全球', 'CoinGecko', 'GitHub', 'Hugging Face',
      'arXiv', 'Bluesky', 'Polymarket', 'Stack Overflow', 'DEV Community', 'Lobsters', 'TechCrunch',
      '美联储', '美国 SEC', 'BBC 中文', '德国之声中文', '法广中文', '彭博社', '金十数据', '财联社',
      '小红书', '新浪微博', '抖音', 'B站', '百度', 'The Verge', 'Ars Technica', 'MIT Technology Review',
      'InfoQ', '少数派', 'Solidot',
    ]))
    expect(() => Config({ collectionIntervalMinutes: 0 })).toThrow()
    expect(() => Config({ itemsPerPlatform: 0 })).toThrow()
    expect(() => Config({ itemsPerPlatform: 101 })).toThrow()
    expect(() => Config({ historyRetentionDays: -1 })).toThrow()
    expect(() => Config({ requestTimeoutSeconds: 0 })).toThrow()
    expect(() => Config({ requestTimeoutSeconds: 121 })).toThrow()
    expect(() => Config({ journalMode: 'memory' })).toThrow()
  })
})

describe('RSS 与身份', () => {
  it('解析量子位和 IT之家元数据，不携带正文', () => {
    const qbitai = parseRss('qbitai', fixture('qbitai.xml'), 30)
    const ithome = parseRss('ithome', fixture('ithome.xml'), 30)
    expect(qbitai.topics).toHaveLength(2)
    expect(qbitai.fetchedCount).toBe(3)
    expect(qbitai.invalidCount).toBe(1)
    expect(qbitai.topics.map(item => item.rank)).toEqual([1, 2])
    expect(ithome.topics).toHaveLength(2)
    expect(parseRss('ithome', fixture('ithome.xml'), 1).topics).toHaveLength(1)
    expect(JSON.stringify({ qbitai, ithome })).not.toContain('不会保存的正文')
  })

  it('联合哈希不受排名、热度和采集时间影响，并隔离平台', () => {
    const first = identifyTopic(topicFixture({ rank: 1, heat: 10 }))
    const changed = identifyTopic(topicFixture({ rank: 9, heat: 999, publishedTime: '2026-09-12T00:00:00.000Z' }))
    const other = identifyTopic(topicFixture({ platformCode: 'ithome' }))
    expect(Buffer.from(first.hash).equals(Buffer.from(changed.hash))).toBe(true)
    expect(Buffer.from(first.hash).equals(Buffer.from(other.hash))).toBe(false)
  })

  it('按稳定 ID、规范 URL、规范标题的顺序选择身份', () => {
    expect(identifyTopic(topicFixture({ stableId: ' ITEM-1 ' }))).toMatchObject({ kind: 'stable_id', sourceKey: 'item-1' })
    expect(identifyTopic(topicFixture({ stableId: undefined, url: 'https://EXAMPLE.com/a/?utm_source=x&b=2&a=1#part' })))
      .toMatchObject({ kind: 'url', sourceKey: 'https://example.com/a?a=1&b=2' })
    expect(identifyTopic(topicFixture({ stableId: undefined, url: '不是链接', title: '  同一　标题  ' })))
      .toMatchObject({ kind: 'title', sourceKey: '同一 标题' })
  })

  it('解析 Atom 与网页列表来源', () => {
    const atom = parseRss('arxiv', `<?xml version="1.0"?><feed><entry><id>paper-1</id><title>Agent research</title><link href="https://arxiv.org/abs/1"/><published>2026-09-12T00:00:00Z</published></entry></feed>`, 30)
    expect(atom.topics[0]).toMatchObject({ stableId: 'paper-1', title: 'Agent research', url: 'https://arxiv.org/abs/1', rank: 1 })
    const html = parseHtmlLinks('github', `<nav><a href="/">Home</a></nav><article><a href="/org/repo">A useful repository for agents</a></article>`, 'https://github.com/trending', 30)
    expect(html.topics).toEqual([expect.objectContaining({ title: 'A useful repository for agents', url: 'https://github.com/org/repo', rank: 1 })])

    const rdf = parseRss('dw-chinese', `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><item><title>德国之声新闻</title><link>https://www.dw.com/zh/a-1</link></item></rdf:RDF>`, 30)
    expect(rdf.topics[0]).toMatchObject({ title: '德国之声新闻', url: 'https://www.dw.com/zh/a-1' })
  })

  it('解析备用聚合源、币安广场和 Mastodon 状态', () => {
    const fallback = parseJson('36kr', {
      data: [{ title: '备用来源热点', url: 'https://36kr.com/p/123', publish_time: '2026-09-12T00:00:00Z', score: 88 }],
    }, 'https://news.orz.ai/api/v1/dailynews/?platform=36kr', 30)
    expect(fallback.topics[0]).toMatchObject({ title: '备用来源热点', url: 'https://36kr.com/p/123', heat: 88 })

    const binance = parseJson('binance-square-zh', {
      data: { vos: [
        { id: 'en', detectedLanguage: 'en', content: 'English item', webLink: 'https://www.binance.com/en/square/post/1' },
        { id: 'zh', detectedLanguage: 'zh-CN', content: `<p>${'中文内容'.repeat(80)}</p>`, webLink: 'https://www.binance.com/zh-CN/square/post/2', viewCount: 9 },
      ] },
    }, 'https://www.binance.com/bapi/composite/v3/friendly/pgc/content/article/list', 30)
    expect(binance.topics).toHaveLength(1)
    expect(binance.topics[0]).toMatchObject({ stableId: 'zh', heat: 9 })
    expect(binance.topics[0]?.title.length).toBeLessThanOrEqual(180)

    const mastodon = parseJson('mastodon-zh', [{
      id: 'status-1', content: '<p>中文社区热点</p>', url: 'https://m.cmx.im/@author/1',
      created_at: '2026-09-12T00:00:00Z', replies_count: 2, reblogs_count: 3, favourites_count: 4,
    }], 'https://m.cmx.im/api/v1/trends/statuses', 30)
    expect(mastodon.topics[0]).toMatchObject({ title: '中文社区热点', heat: 9 })
  })

  it('解析 arXiv recent 页面', () => {
    const feed = parseArxivHtml(`<dl><dt><a href ="/abs/2609.11916" title="Abstract" id="2609.11916">arXiv</a></dt>
      <dd><div class='meta'><div class='list-title mathjax'><span class='descriptor'>Title:</span>
      Can Edge-Deployable Models Identify Species?</div></div></dd></dl>`, 'https://arxiv.org/list/cs.AI/recent', 30)
    expect(feed.topics[0]).toMatchObject({
      stableId: '2609.11916',
      title: 'Can Edge-Deployable Models Identify Species?',
      url: 'https://arxiv.org/abs/2609.11916',
    })
  })

  it('解析小红书公开页面和金十快讯', () => {
    const xiaohongshu = parseXiaohongshuHtml(`<a href="/explore/6a84a068000000002202ce7a?xsec_token=token" class="title"><span>公开推荐内容</span></a>`, 30)
    expect(xiaohongshu.topics[0]).toMatchObject({
      stableId: '6a84a068000000002202ce7a',
      title: '公开推荐内容',
      url: 'https://www.xiaohongshu.com/explore/6a84a068000000002202ce7a',
    })

    const jin10 = parseJson('jin10', { data: [{
      id: 'flash-1', time: '2026-09-13 23:11:48', important: 1,
      extras: { ad: false }, data: { content: '金十市场快讯' },
    }] }, 'https://flash-api.jin10.com/get_flash_list', 30)
    expect(jin10.topics[0]).toMatchObject({ stableId: 'flash-1', title: '金十市场快讯', heat: 1 })

    const cls = parseJson('cls', { data: [
      { title: '财联社快讯一', url: 'https://www.cls.cn/telegraph' },
      { title: '财联社快讯二', url: 'https://www.cls.cn/telegraph' },
    ] }, 'https://news.orz.ai/api/v1/dailynews/?platform=cls', 30)
    expect(cls.topics.map(topic => topic.stableId)).toEqual(['财联社快讯一', '财联社快讯二'])
  })
})

describe('SQLite 仓储', () => {
  it('创建五张统一字段业务表，且没有 CHECK 和 FOREIGN KEY 约束', () => {
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const tables = database.handle.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ).all() as unknown as Array<{ name: string; sql: string }>
      expect(tables.map(row => row.name)).toEqual(['collection_run', 'creation_queue', 'platform', 'topic', 'topic_observation'])
      for (const table of tables) {
        const columns = database.handle.prepare(`PRAGMA table_info(${table.name})`).all() as unknown as Array<{
          name: string; type: string; notnull: number; dflt_value: string | null; pk: number
        }>
        expect(columns.map(column => column.name)).toEqual(expect.arrayContaining(['id', 'deleted', 'create_time', 'update_time']))
        expect(columns.find(column => column.name === 'id')).toMatchObject({ type: 'INTEGER', pk: 1 })
        expect(columns.find(column => column.name === 'deleted')).toMatchObject({ notnull: 1, dflt_value: '0' })
        expect(columns.find(column => column.name === 'create_time')).toMatchObject({ notnull: 1, dflt_value: 'CURRENT_TIMESTAMP' })
        expect(columns.find(column => column.name === 'update_time')).toMatchObject({ notnull: 1, dflt_value: 'CURRENT_TIMESTAMP' })
        expect(table.sql.toUpperCase()).not.toContain('CHECK')
        expect(table.sql.toUpperCase()).not.toContain('FOREIGN KEY')
      }
    } finally {
      database.close()
    }
  })

  it('初始化文件数据库、从版本 1 迁移并拒绝未知版本', () => {
    const directory = mkdtempSync(join(tmpdir(), 'topic-desk-schema-'))
    const path = join(directory, 'nested', 'topics.sqlite')
    try {
      new TopicDatabase(path, 'delete').close()
      new TopicDatabase(path, 'delete').close()
      const raw = new DatabaseSync(path)
      raw.exec('DROP TABLE creation_queue; PRAGMA user_version = 1')
      raw.close()
      new TopicDatabase(path, 'delete').close()
      const migrated = new DatabaseSync(path)
      expect(migrated.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 })
      expect(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'creation_queue'").get()).toMatchObject({ name: 'creation_queue' })
      migrated.exec('PRAGMA user_version = 3')
      migrated.close()
      expect(() => new TopicDatabase(path, 'delete')).toThrow('不支持的 Topic Desk 数据库版本：3')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('由业务逻辑拒绝跨平台关联采集运行', () => {
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(Config({})))
      const runId = repository.createRun('qbitai', 'manual', 'running')
      expect(() => repository.commitFeed('ithome', runId, {
        topics: [topicFixture({ platformCode: 'ithome' })],
        fetchedCount: 1,
        invalidCount: 0,
      })).toThrow(`采集运行不属于平台或状态无效：ithome/${runId}`)
      expect(database.handle.prepare('SELECT COUNT(*) AS count FROM topic').get()).toMatchObject({ count: 0 })
    } finally {
      database.close()
    }
  })

  it('重复采集保留标题和首次时间，更新排名并保留真实历史', async () => {
    const config = Config({})
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(config))
      const firstRun = repository.createRun('qbitai', 'manual', 'running')
      repository.commitFeed('qbitai', firstRun, { topics: [topicFixture({ title: '原标题', rank: 8, heat: 12 })], fetchedCount: 1, invalidCount: 0 })
      const first = database.handle.prepare('SELECT title, rank, create_time, update_time FROM topic').get() as Record<string, unknown>
      database.handle.exec('UPDATE topic SET deleted = 1')
      await new Promise(resolve => setTimeout(resolve, 2))
      const secondRun = repository.createRun('qbitai', 'manual', 'running')
      repository.commitFeed('qbitai', secondRun, { topics: [topicFixture({ title: '改过的标题', rank: 2, heat: 99 })], fetchedCount: 1, invalidCount: 0 })
      const second = database.handle.prepare('SELECT title, rank, heat, deleted, last_collection_run_id, create_time, update_time FROM topic').get() as Record<string, unknown>
      expect(second.title).toBe('原标题')
      expect(second.rank).toBe(2)
      expect(second.heat).toBe(99)
      expect(second.deleted).toBe(0)
      expect(second.last_collection_run_id).toBe(secondRun)
      expect(second.create_time).toBe(first.create_time)
      expect(second.update_time).not.toBe(first.update_time)
      expect((database.handle.prepare('SELECT COUNT(*) AS count FROM topic').get() as { count: number }).count).toBe(1)
      expect((database.handle.prepare('SELECT COUNT(*) AS count FROM topic_observation').get() as { count: number }).count).toBe(2)
      const page = repository.list({ source: 'qbitai' })
      expect(page.topics[0]).toMatchObject({ rank: 2, rankDelta: 6, consecutiveRuns: 2, trend: [8, 2] })
    } finally {
      database.close()
    }
  })

  it('按国内外与话题类别筛选，并返回平台分类元数据', () => {
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(Config({})))
      const domesticRun = repository.createRun('qbitai', 'manual', 'running')
      repository.commitFeed('qbitai', domesticRun, {
        topics: [topicFixture({ platformCode: 'qbitai', stableId: 'domestic-tech' })], fetchedCount: 1, invalidCount: 0,
      })
      const internationalRun = repository.createRun('hacker-news', 'manual', 'running')
      repository.commitFeed('hacker-news', internationalRun, {
        topics: [topicFixture({ platformCode: 'hacker-news', stableId: 'international-dev' })], fetchedCount: 1, invalidCount: 0,
      })

      expect(repository.list({ region: 'domestic' }).topics).toEqual([
        expect.objectContaining({ platformCode: 'qbitai', category: 'technology' }),
      ])
      expect(repository.list({ region: 'international', category: 'developer' }).topics).toEqual([
        expect.objectContaining({ platformCode: 'hacker-news', category: 'developer' }),
      ])
      expect(repository.statuses()).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'qbitai', region: 'domestic', category: 'technology' }),
        expect.objectContaining({ code: 'hacker-news', region: 'international', category: 'developer' }),
      ]))
    } finally {
      database.close()
    }
  })

  it('合并平台时返回连续总排名，同时保留各平台原始排名', () => {
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(Config({})))
      const domesticRun = repository.createRun('qbitai', 'manual', 'running')
      repository.commitFeed('qbitai', domesticRun, {
        topics: [topicFixture({ platformCode: 'qbitai', stableId: 'domestic-rank-2', rank: 2 })], fetchedCount: 1, invalidCount: 0,
      })
      const internationalRun = repository.createRun('hacker-news', 'manual', 'running')
      repository.commitFeed('hacker-news', internationalRun, {
        topics: [topicFixture({ platformCode: 'hacker-news', stableId: 'international-rank-1', rank: 1 })], fetchedCount: 1, invalidCount: 0,
      })

      const all = repository.list().topics
      expect(all.map(topic => ({ platform: topic.platformCode, global: topic.globalRank, platformRank: topic.rank }))).toEqual([
        { platform: 'hacker-news', global: 1, platformRank: 1 },
        { platform: 'qbitai', global: 2, platformRank: 2 },
      ])
      expect(repository.list({ source: 'qbitai' }).topics[0]).toMatchObject({ globalRank: 1, rank: 2 })
      expect(repository.list({ topicIds: [all[1]!.id] }).topics).toEqual([
        expect.objectContaining({ id: all[1]!.id, platformCode: 'qbitai' }),
      ])
      expect(() => repository.list({ topicIds: [0] })).toThrow('topicIds 必须全部为正整数')
    } finally {
      database.close()
    }
  })

  it('收藏话题并在掉榜后继续保留于待创作列表', () => {
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(Config({})))
      const firstRun = repository.createRun('qbitai', 'manual', 'running')
      repository.commitFeed('qbitai', firstRun, {
        topics: [topicFixture({ stableId: 'saved-topic', title: '值得创作的选题' })], fetchedCount: 1, invalidCount: 0,
      })
      const topicId = repository.list({ source: 'qbitai' }).topics[0]!.id
      expect(repository.list({ source: 'qbitai' })).toMatchObject({ queuedTotal: 0, topics: [{ queued: false, queuedAt: null }] })

      expect(repository.setQueued(topicId, true)).toEqual({ topicId, queued: true })
      expect(repository.list({ source: 'qbitai' })).toMatchObject({ queuedTotal: 1, topics: [{ queued: true }] })

      const secondRun = repository.createRun('qbitai', 'manual', 'running')
      repository.commitFeed('qbitai', secondRun, {
        topics: [topicFixture({ stableId: 'new-topic', title: '新上榜选题' })], fetchedCount: 1, invalidCount: 0,
      })
      expect(repository.list({ queuedOnly: true })).toMatchObject({
        total: 1,
        queuedTotal: 1,
        topics: [{ id: topicId, title: '值得创作的选题', queued: true }],
      })

      expect(repository.setQueued(topicId, false)).toEqual({ topicId, queued: false })
      expect(repository.list({ queuedOnly: true })).toMatchObject({ total: 0, queuedTotal: 0, topics: [] })
      expect(() => repository.setQueued(0, true)).toThrow('topicId 必须是正整数')
      expect(() => repository.setQueued(topicId + 999, true)).toThrow('话题不存在或已失效')
    } finally {
      database.close()
    }
  })
})

describe('按需翻译', () => {
  it('只识别不含中日韩文字的英文标题', () => {
    expect(isEnglishTitle('A practical guide to small language models')).toBe(true)
    expect(isEnglishTitle('DeepSeek V4：模型更新')).toBe(false)
    expect(isEnglishTitle('用于创作的话题')).toBe(false)
    expect(isEnglishTitle('2026 / 09 / 15')).toBe(false)
  })

  it('从当前榜单读取标题，并合并同一话题的并发模型请求', async () => {
    const config = Config({})
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(config))
      const run = repository.createRun('hacker-news', 'manual', 'running')
      repository.commitFeed('hacker-news', run, {
        topics: [topicFixture({ platformCode: 'hacker-news', stableId: 'english', title: 'An English title' })],
        fetchedCount: 1,
        invalidCount: 0,
      })
      const topicId = repository.list({ source: 'hacker-news' }).topics[0]!.id
      let release!: (value: string) => void
      const generate = vi.fn(() => new Promise<string>(resolve => { release = resolve }))
      const translator = new TopicTranslator(repository, generate)
      const first = translator.translate({ topicId })
      const second = translator.translate({ topicId })
      expect(first).toBe(second)
      expect(generate).toHaveBeenCalledOnce()
      expect(generate).toHaveBeenCalledWith('An English title')
      release('一个英文标题')
      await expect(first).resolves.toEqual({ topicId, translation: '一个英文标题' })
      expect(() => translator.translate({ topicId: 0 })).toThrow('topicId 必须是正整数')
      expect(() => translator.translate({ topicId: topicId + 999 })).toThrow('话题不存在或已失效')
    } finally {
      database.close()
    }
  })

  it('拒绝由 Remote 伪造的中文标题翻译请求', () => {
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(Config({})))
      const run = repository.createRun('qbitai', 'manual', 'running')
      repository.commitFeed('qbitai', run, { topics: [topicFixture()], fetchedCount: 1, invalidCount: 0 })
      const topicId = repository.list({ source: 'qbitai' }).topics[0]!.id
      const translator = new TopicTranslator(repository, vi.fn())
      expect(() => translator.translate({ topicId })).toThrow('只有英文标题可以翻译')
    } finally {
      database.close()
    }
  })
})

describe('采集协调器', () => {
  it('手动刷新返回本轮真实新增与更新数量', async () => {
    const config = Config({
      sources: Object.fromEntries(platformCatalog.map(({ code }) => [
        code,
        { ...defaultSourceConfigs[code], enabled: code === 'qbitai' },
      ])),
    })
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(config))
      const coordinator = new CollectionCoordinator(repository, config, async () => ({
        topics: [topicFixture({ stableId: 'refresh-stats' })], fetchedCount: 1, invalidCount: 0,
      }))
      const first = await coordinator.refresh()
      expect(first).toMatchObject({ accepted: true, message: '刷新完成', inserted: 1, updated: 0 })
      expect(first.insertedTopicIds).toHaveLength(1)
      await expect(coordinator.refresh()).resolves.toEqual({
        accepted: true, message: '刷新完成', inserted: 0, updated: 1, insertedTopicIds: [],
      })
    } finally {
      database.close()
    }
  })

  it('隔离平台失败，并提交另一平台的成功结果', async () => {
    const config = Config({})
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(config))
      const coordinator = new CollectionCoordinator(repository, config, async (platform) => {
        if (platform === 'qbitai') throw new Error('模拟来源不可用')
        return {
          topics: [topicFixture({ platformCode: 'ithome', stableId: 'ithome-1', title: '另一来源仍成功' })],
          fetchedCount: 1,
          invalidCount: 0,
        }
      })
      await coordinator.collectAll('manual')
      expect(repository.statuses()).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'qbitai', status: 'failed', error: '模拟来源不可用' }),
        expect.objectContaining({ code: 'ithome', status: 'succeeded', error: null }),
      ]))
      expect(repository.list({ source: 'ithome' }).topics[0]?.title).toBe('另一来源仍成功')
    } finally {
      database.close()
    }
  })

  it('同平台重叠采集只运行一个请求，并记录跳过原因', async () => {
    const config = Config({
      sources: Object.fromEntries(platformCatalog.map(({ code }) => [
        code,
        { ...defaultSourceConfigs[code], enabled: code === 'qbitai' },
      ])),
    })
    const database = new TopicDatabase(':memory:', 'delete')
    try {
      const repository = new TopicRepository(database, true)
      repository.ensurePlatforms(platformDefinitions(config))
      let release!: () => void
      const gate = new Promise<void>(resolve => { release = resolve })
      let requests = 0
      const coordinator = new CollectionCoordinator(repository, config, async () => {
        requests += 1
        await gate
        return { topics: [topicFixture()], fetchedCount: 1, invalidCount: 0 }
      })
      const first = coordinator.collectAll('manual')
      await Promise.resolve()
      await coordinator.collectAll('schedule')
      release()
      await first
      expect(requests).toBe(1)
      const runs = database.handle.prepare(
        'SELECT status, error_message FROM collection_run ORDER BY id',
      ).all() as unknown as Array<{ status: string; error_message: string | null }>
      expect(runs).toEqual([
        { status: 'succeeded', error_message: null },
        { status: 'skipped', error_message: '上一轮采集仍在运行' },
      ])
    } finally {
      database.close()
    }
  })
})
