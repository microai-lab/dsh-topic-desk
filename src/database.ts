import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.ts'

const SCHEMA_VERSION = 2
const JOURNAL_MODES = new Set(['wal', 'delete', 'truncate', 'persist'])

function readSchemaSql(): string {
  const packagedSchema = new URL('./schema.sql', import.meta.url)
  const sourceSchema = new URL('../db/schema.sql', import.meta.url)
  return readFileSync(existsSync(packagedSchema) ? packagedSchema : sourceSchema, 'utf8')
}

/** Topic Desk 专属 SQLite 连接及事务边界。 */
export class TopicDatabase {
  readonly handle: DatabaseSync

  constructor(path: string, journalMode: Config['journalMode']) {
    if (path.trim() === '') throw new TypeError('databasePath 不能为空')
    if (!JOURNAL_MODES.has(journalMode)) throw new TypeError(`不支持的 journalMode：${journalMode}`)
    const target = path === ':memory:' ? path : resolve(path)
    if (target !== ':memory:') mkdirSync(dirname(target), { recursive: true })
    this.handle = new DatabaseSync(target)
    try {
      this.handle.exec(`PRAGMA journal_mode = ${journalMode.toUpperCase()}`)
      this.initialize()
    } catch (error) {
      this.handle.close()
      throw error
    }
  }

  private initialize(): void {
    const row = this.handle.prepare('PRAGMA user_version').get() as { user_version: number }
    if (row.user_version === SCHEMA_VERSION) return
    if (row.user_version === 1) {
      this.migrateFromV1()
      return
    }
    if (row.user_version !== 0) throw new Error(`不支持的 Topic Desk 数据库版本：${row.user_version}`)
    const existing = this.handle.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).get() as { count: number }
    if (existing.count > 0) throw new Error('Topic Desk 数据库版本为 0，但已经包含业务表')
    const sql = readSchemaSql()
    this.handle.exec('BEGIN IMMEDIATE')
    try {
      this.handle.exec(sql)
      this.handle.exec('COMMIT')
    } catch (error) {
      this.handle.exec('ROLLBACK')
      throw error
    }
  }

  private migrateFromV1(): void {
    this.handle.exec('BEGIN IMMEDIATE')
    try {
      this.handle.exec(`
        CREATE TABLE creation_queue (
          id INTEGER PRIMARY KEY,
          deleted INTEGER NOT NULL DEFAULT 0,
          create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          topic_id INTEGER NOT NULL,
          UNIQUE (topic_id)
        );
        CREATE INDEX idx_creation_queue_active_time
          ON creation_queue (deleted, create_time DESC, id DESC);
        PRAGMA user_version = 2;
      `)
      this.handle.exec('COMMIT')
    } catch (error) {
      this.handle.exec('ROLLBACK')
      throw error
    }
  }

  transaction<T>(operation: () => T): T {
    this.handle.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.handle.exec('COMMIT')
      return result
    } catch (error) {
      this.handle.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.handle.close()
  }
}
