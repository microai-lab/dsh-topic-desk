import { resolve } from 'node:path'
import { Config, platformDefinitions } from '../src/config.ts'
import { CollectionCoordinator } from '../src/coordinator.ts'
import { TopicDatabase } from '../src/database.ts'
import { TopicRepository } from '../src/repository.ts'

const databaseArgument = process.argv.slice(2).find(argument => argument !== '--')
const databasePath = resolve(databaseArgument ?? './data/topic-desk.sqlite')
const config = Config({ databasePath })
const database = new TopicDatabase(config.databasePath, config.journalMode)

try {
  const repository = new TopicRepository(database, config.historyEnabled)
  repository.ensurePlatforms(platformDefinitions(config))
  const coordinator = new CollectionCoordinator(repository, config)
  await coordinator.collectAll('manual')
  const page = repository.list({ limit: 60 })
  process.stdout.write(`${JSON.stringify({
    databasePath,
    total: page.total,
    sources: page.statuses,
    topics: page.topics.map(topic => ({
      rank: topic.rank,
      source: topic.platformName,
      title: topic.title,
      url: topic.url,
      rankDelta: topic.rankDelta,
      consecutiveRuns: topic.consecutiveRuns,
    })),
  }, null, 2)}\n`)
} finally {
  database.close()
}
