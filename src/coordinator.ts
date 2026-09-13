import type { Config } from './config.ts'
import { fetchSource } from './source-fetcher.ts'
import { TopicRepository } from './repository.ts'
import type { PlatformCode, PlatformDefinition, RefreshResult, TriggerKind } from './types.ts'

type FeedFetcher = typeof fetchSource

/** 周期采集协调器：同平台单飞、跨平台隔离，且每轮由仓储原子提交。 */
export class CollectionCoordinator {
  private readonly running = new Set<PlatformCode>()
  private readonly pending = new Set<Promise<void>>()
  private abortController = new AbortController()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly repository: TopicRepository,
    private readonly config: Config,
    private readonly fetchFeed: FeedFetcher = fetchSource,
  ) {}

  start(): void {
    if (this.timer !== undefined) return
    if (this.abortController.signal.aborted) this.abortController = new AbortController()
    this.enqueue('startup')
    this.timer = setInterval(() => { this.enqueue('schedule') }, this.config.collectionIntervalMinutes * 60_000)
  }

  async stop(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.abortController.abort()
    await Promise.allSettled([...this.pending])
  }

  async refresh(): Promise<RefreshResult> {
    const platforms = this.repository.enabledPlatforms()
    if (platforms.length === 0) return { accepted: false, message: '没有启用的数据来源' }
    await this.collectAll('manual')
    return { accepted: true, message: '刷新完成' }
  }

  async collectAll(trigger: TriggerKind): Promise<void> {
    const platforms = this.repository.enabledPlatforms()
    const cursor = { value: 0 }
    const workers = Array.from({ length: Math.min(6, platforms.length) }, async () => {
      while (cursor.value < platforms.length) {
        const platform = platforms[cursor.value++]
        if (platform !== undefined) await this.collectPlatform(platform, trigger)
      }
    })
    await Promise.allSettled(workers)
    this.repository.cleanObservations(this.config.historyRetentionDays)
  }

  private enqueue(trigger: TriggerKind): void {
    const task = this.collectAll(trigger)
    this.pending.add(task)
    void task.then(
      () => { this.pending.delete(task) },
      () => { this.pending.delete(task) },
    )
  }

  private async collectPlatform(platform: PlatformDefinition, trigger: TriggerKind): Promise<void> {
    if (this.running.has(platform.code)) {
      this.repository.createRun(platform.code, trigger, 'skipped', '上一轮采集仍在运行')
      return
    }
    this.running.add(platform.code)
    const runId = this.repository.createRun(platform.code, trigger, 'running')
    try {
      const feed = await this.fetchFeed(
        platform.code,
        platform.feedUrl,
        this.config.itemsPerPlatform,
        this.config.requestTimeoutSeconds,
        this.config.userAgent,
        this.config.proxyUrl,
        this.abortController.signal,
      )
      this.repository.commitFeed(platform.code, runId, feed)
    } catch (error) {
      this.repository.failRun(runId, error)
    } finally {
      this.running.delete(platform.code)
    }
  }
}
