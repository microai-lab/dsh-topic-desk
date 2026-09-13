/** Browser entry：挂载严格 Remote 描述符，并注册 Topic Desk 全局面板。 */
import topicDeskRemote from '@dsh-topic-desk/plugin/remote'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@dsh-topic-desk/plugin/remote'
import { TopicDeskIcon, TopicDeskPanel, type TopicDeskActions } from './TopicDeskPanel.tsx'
import { en, NS, zh, type TopicDeskKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Topic Desk 全局面板文案。 */
    'topic-desk': TopicDeskKey
  }
}

export const inject = ['remote', 'slots', 'locale']
const PANEL_ID = 'topic-desk' as MainPanelId

function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'topic-desk: dictionaries')
  const actions: TopicDeskActions = {
    async list(query) {
      const result = await ctx.remote.topicDesk.list(query)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async refresh() {
      const result = await ctx.remote.topicDesk.refresh()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
  }
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS, inject: () => actions,
  }, TopicDeskPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 35, label: () => ctx.locale.bind(NS)('title'),
  }, TopicDeskIcon))
}

/** 按 DSH Client 生命周期挂载 Remote 与 UI，卸载时按相反顺序释放。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(topicDeskRemote)
  const ui = ctx.inject(['remote.topicDesk', 'slots', 'locale'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}

export { TopicDeskPanel } from './TopicDeskPanel.tsx'
