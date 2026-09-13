import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
mkdirSync(resolve(root, 'lib'), { recursive: true })
copyFileSync(resolve(root, 'db/schema.sql'), resolve(root, 'lib/schema.sql'))
