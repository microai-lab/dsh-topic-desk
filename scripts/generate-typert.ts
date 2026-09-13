import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const workspace = resolve(import.meta.dirname, '..')
const temporaryWorkspace = mkdtempSync(join(tmpdir(), 'dsh-topic-desk-typert-'))
const packageRoot = resolve(temporaryWorkspace, 'packages/dsh-topic-desk')
const protocolRoot = resolve(temporaryWorkspace, 'packages/_build/typert-protocol')

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

try {
  mkdirSync(packageRoot, { recursive: true })
  mkdirSync(protocolRoot, { recursive: true })
  cpSync(resolve(workspace, 'src'), resolve(packageRoot, 'src'), { recursive: true })
  cpSync(resolve(workspace, 'package.json'), resolve(packageRoot, 'package.json'))
  cpSync(resolve(workspace, 'packages/_build/typert-protocol/index.d.ts'), resolve(protocolRoot, 'index.d.ts'))
  cpSync(resolve(workspace, 'packages/_build/typert-protocol/index.js'), resolve(protocolRoot, 'index.js'))
  cpSync(resolve(workspace, 'packages/_build/typert-protocol/package.json'), resolve(protocolRoot, 'package.json'))
  cpSync(
    resolve(workspace, 'packages/_build/typert-protocol/tsconfig.host.json'),
    resolve(protocolRoot, 'tsconfig.host.json'),
  )

  cpSync(resolve(workspace, 'tsconfig.base.json'), resolve(temporaryWorkspace, 'tsconfig.base.json'))
  writeJson(resolve(packageRoot, 'tsconfig.host.json'), {
    extends: '../../tsconfig.base.json',
    compilerOptions: { rootDir: 'src', outDir: 'lib/types' },
    include: ['src/**/*.ts'],
    exclude: ['src/client/**/*'],
  })
  writeJson(resolve(packageRoot, 'tsconfig.client.json'), {
    extends: '../../tsconfig.base.json',
    compilerOptions: { rootDir: 'src', outDir: 'lib/types', jsx: 'react-jsx', types: [] },
    include: ['src/client/**/*.ts', 'src/client/**/*.tsx', 'src/types.ts', 'src/css-modules.d.ts'],
  })
  writeJson(resolve(temporaryWorkspace, 'tsconfig.host.json'), {
    files: [],
    references: [
      { path: './packages/_build/typert-protocol/tsconfig.host.json' },
      { path: './packages/dsh-topic-desk/tsconfig.host.json' },
    ],
  })
  writeJson(resolve(temporaryWorkspace, 'tsconfig.client.json'), {
    files: [],
    references: [{ path: './packages/dsh-topic-desk/tsconfig.client.json' }],
  })

  symlinkSync(resolve(workspace, 'node_modules'), resolve(temporaryWorkspace, 'node_modules'), 'dir')
  mkdirSync(resolve(packageRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  symlinkSync(protocolRoot, resolve(packageRoot, 'node_modules/@deepseek-ai/dsh-typert-protocol'), 'dir')
  const protocolModules = resolve(workspace, 'packages/_build/typert-protocol/node_modules')
  symlinkSync(protocolModules, resolve(protocolRoot, 'node_modules'), 'dir')

  const [artifact] = new WorkspaceTypertGenerator(temporaryWorkspace).generate(['@dsh-topic-desk/plugin'], ['host'])
  if (artifact === undefined || artifact.remote === undefined) {
    throw new Error('Topic Desk 没有生成 Host Remote 工件')
  }
  const output = resolve(workspace, 'lib')
  mkdirSync(output, { recursive: true })
  writeFileSync(resolve(output, 'typert.host.js'), artifact.js)
  writeFileSync(resolve(output, 'typert.host.d.ts'), artifact.dts)
  writeFileSync(resolve(output, 'typert.remote-client.js'), artifact.remote.js)
  writeFileSync(resolve(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
  writeFileSync(resolve(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
} catch (error) {
  const manifest = JSON.parse(readFileSync(resolve(workspace, 'package.json'), 'utf8')) as { name?: string }
  throw new Error(`无法为 ${manifest.name ?? '@dsh-topic-desk/plugin'} 生成 Typert 工件`, { cause: error })
} finally {
  rmSync(temporaryWorkspace, { recursive: true, force: true })
}
