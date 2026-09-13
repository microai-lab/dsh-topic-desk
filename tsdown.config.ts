import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

const packageId = '@dsh-topic-desk/plugin'
const cssPrefix = '\0topic-desk-css:'
const cssSuffix = '.mjs'

function cssModulePlugin() {
  return {
    name: 'topic-desk-css-modules',
    resolveId(source: string, importer?: string) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      const emitted = resolve(dirname(importer), source)
      const file = emitted.replace('/lib/types/', '/src/')
      return cssPrefix + file + cssSuffix
    },
    async load(this: { addWatchFile: (path: string) => void }, id: string) {
      if (!id.startsWith(cssPrefix)) return null
      const file = id.slice(cssPrefix.length, -cssSuffix.length)
      this.addWatchFile(file)
      const source = await readFile(file)
      const result = transform({
        filename: file,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classes: Record<string, string> = {}
      for (const [local, value] of Object.entries(result.exports ?? {})) classes[local] = value.name
      const tagId = `${packageId}/${basename(file)}`
      return [
        `const css=${JSON.stringify(result.code.toString())};`,
        `const tagId=${JSON.stringify(tagId)};`,
        "if(typeof document!=='undefined'&&!document.querySelector('style[data-plugin-css='+JSON.stringify(tagId)+']')){",
        "const tag=document.createElement('style');tag.dataset.pluginCss=tagId;tag.textContent=css;document.head.appendChild(tag);}",
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }
}

export default defineConfig([
  {
    name: packageId,
    entry: { index: 'lib/types/index.js' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    sourcemap: true,
    outputOptions: { entryFileNames: '[name].js' },
    external: [/^@deepseek-ai\//, /^fast-xml-parser(?:\/|$)/, /^zod(?:\/|$)/, /^node:/],
  },
  {
    name: `${packageId}/client`,
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    clean: false,
    sourcemap: true,
    external: ['react', 'react/jsx-runtime'],
    noExternal: /^(?:zod|@dsh-topic-desk\/plugin\/remote)(?:\/|$)/,
    inlineOnly: ['zod'],
    plugins: [cssModulePlugin()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(packageId)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
