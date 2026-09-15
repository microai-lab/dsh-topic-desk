import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { CollectionCoordinator } from './coordinator.ts'
import { platformDefinitions, type Config as TopicDeskConfig } from './config.ts'
import { TopicDatabase } from './database.ts'
import { TopicRepository } from './repository.ts'
import { TopicTranslator, translateWithHarness } from './translator.ts'
import type { RefreshResult, TopicPage, TopicQuery, TranslationRequest, TranslationResult } from './types.ts'

export { Config } from './config.ts'
export type * from './types.ts'
export { CollectionCoordinator } from './coordinator.ts'
export { TopicDatabase } from './database.ts'
export { identifyTopic, normalizeUrl } from './identity.ts'
export { TopicRepository } from './repository.ts'
export { isEnglishTitle, TopicTranslator, translateWithHarness } from './translator.ts'
export { fetchRss, parseRss } from './rss.ts'
export { fetchSource, parseArxivHtml, parseHtmlLinks, parseJson, parseXiaohongshuHtml } from './source-fetcher.ts'
export { platformCatalog } from './platforms.ts'

export const name = 'topic-desk'
export const inject = ['llm', 'agentDefaultModel']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Topic Desk Host Remote 服务。 */
    topicDesk: TopicDeskGateway
  }
}

/** 向 DSH Client 暴露本地热点查询与手动刷新。 */
export class TopicDeskGateway extends TypertRemoteService {
  constructor(
    ctx: Context,
    private readonly repository: TopicRepository,
    private readonly coordinator: CollectionCoordinator,
    private readonly translator: TopicTranslator,
  ) {
    super(ctx, 'topicDesk')
  }

  /** 查询已经提交到本地数据库的当前榜单。 */
  @Remote('list')
  async list(query: TopicQuery): Promise<TopicPage> {
    return this.repository.list(query)
  }

  /** 触发所有已启用来源的一次受控刷新。 */
  @Remote('refresh')
  async refresh(): Promise<RefreshResult> {
    return await this.coordinator.refresh()
  }

  /** 使用 Harness 当前默认模型按需翻译一条英文标题。 */
  @Remote('translate')
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    return await this.translator.translate(request)
  }
}

function validateConfig(config: TopicDeskConfig): void {
  if (config.proxyUrl !== '') {
    const proxy = new URL(config.proxyUrl)
    if (proxy.protocol !== 'http:' && proxy.protocol !== 'https:') {
      throw new TypeError('proxyUrl 必须留空或使用 HTTP(S)')
    }
  }
  for (const source of platformDefinitions(config)) {
    const url = new URL(source.feedUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TypeError(`${source.code}.feedUrl 必须使用 HTTP(S)`)
    }
  }
}

/** 挂载 Topic Desk Host 服务，并把数据库与定时器绑定到 Cordis 生命周期。 */
export function apply(ctx: Context, config: TopicDeskConfig): void {
  validateConfig(config)
  const database = new TopicDatabase(config.databasePath, config.journalMode)
  const repository = new TopicRepository(database, config.historyEnabled)
  repository.ensurePlatforms(platformDefinitions(config))
  const coordinator = new CollectionCoordinator(repository, config)
  const translator = new TopicTranslator(repository, title => translateWithHarness(ctx, title))
  try {
    new TopicDeskGateway(ctx, repository, coordinator, translator)
    ctx.effect(() => {
      coordinator.start()
      return async () => {
        await coordinator.stop()
        database.close()
      }
    }, 'topic-desk: database and collection lifecycle')
  } catch (error) {
    void coordinator.stop().finally(() => { database.close() })
    throw error
  }
}
