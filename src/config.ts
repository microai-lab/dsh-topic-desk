import z from '@deepseek-ai/schemastery'
import { platformCatalog } from './platforms.ts'
import type { PlatformCode, PlatformDefinition } from './types.ts'

export interface SourceConfig {
  readonly enabled: boolean
  readonly feedUrl: string
}

/** Topic Desk 插件配置。 */
export interface Config {
  readonly databasePath: string
  readonly journalMode: 'wal' | 'delete' | 'truncate' | 'persist'
  readonly collectionIntervalMinutes: number
  readonly itemsPerPlatform: number
  readonly historyEnabled: boolean
  readonly historyRetentionDays: number
  readonly requestTimeoutSeconds: number
  readonly userAgent: string
  readonly proxyUrl: string
  readonly sources: Partial<Record<PlatformCode, SourceConfig>>
}

const SourceSchema: z<SourceConfig> = z.object({
  enabled: z.boolean().default(true),
  feedUrl: z.string(),
})

export const defaultSourceConfigs = Object.fromEntries(platformCatalog.map(source => [
  source.code,
  { enabled: true, feedUrl: source.endpointUrl },
])) as Record<PlatformCode, SourceConfig>

export const Config: z<Config> = z.object({
  databasePath: z.string().default('./data/topic-desk.sqlite'),
  journalMode: z.union(['wal', 'delete', 'truncate', 'persist']).default('wal'),
  collectionIntervalMinutes: z.number().min(1).step(1).default(10),
  itemsPerPlatform: z.number().min(1).max(100).step(1).default(30),
  historyEnabled: z.boolean().default(true),
  historyRetentionDays: z.number().min(0).step(1).default(30),
  requestTimeoutSeconds: z.number().min(1).max(120).step(1).default(15),
  userAgent: z.string().default('dsh-topic-desk/0.1 (+local single-user feed reader)'),
  proxyUrl: z.string().default('http://127.0.0.1:7897'),
  sources: z.dict(SourceSchema).default(defaultSourceConfigs),
})

/** 从已校验配置生成全部内置平台定义。 */
export function platformDefinitions(config: Config): PlatformDefinition[] {
  return platformCatalog.map(platform => ({
    code: platform.code,
    displayName: platform.displayName,
    homeUrl: platform.homeUrl,
    ...(config.sources[platform.code] ?? defaultSourceConfigs[platform.code]),
  }))
}
