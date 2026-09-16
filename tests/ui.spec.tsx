// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopicDeskPanel } from '../src/client/TopicDeskPanel.tsx'
import { apply as applyClient } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import type { CreationQueueRequest, TopicPage, TopicQuery } from '../src/types.ts'

afterEach(cleanup)

const page: TopicPage = {
  total: 1,
  queuedTotal: 0,
  historyEnabled: true,
  statuses: [
    { code: 'qbitai', displayName: '量子位', region: 'domestic', category: 'technology', enabled: true, status: 'succeeded', lastRunAt: '2026-09-12T00:00:00.000Z', error: null, topicCount: 1 },
    { code: 'ithome', displayName: 'IT之家', region: 'domestic', category: 'technology', enabled: true, status: 'succeeded', lastRunAt: '2026-09-12T00:00:00.000Z', error: null, topicCount: 0 },
    { code: 'hacker-news', displayName: 'Hacker News', region: 'international', category: 'developer', enabled: true, status: 'succeeded', lastRunAt: '2026-09-12T00:00:00.000Z', error: null, topicCount: 30 },
  ],
  topics: [{
    id: 1,
    platformCode: 'qbitai',
    platformName: '量子位',
    category: 'technology',
    title: '用于创作的话题',
    url: 'https://www.qbitai.com/example.html',
    publishedTime: null,
    globalRank: 7,
    rank: 1,
    heat: null,
    firstSeenAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:10:00.000Z',
    rankDelta: 2,
    consecutiveRuns: 2,
    trend: [3, 1],
    queued: false,
    queuedAt: null,
  }],
}

const t = (key: string): string => zh[key as keyof typeof zh] ?? key
const queueActions = {
  queue: async (request: CreationQueueRequest) => ({ ...request, queued: true }),
  unqueue: async (request: CreationQueueRequest) => ({ ...request, queued: false }),
}

describe('Topic Desk 页面', () => {
  it('以相同 ID 注册侧栏入口和全局主面板，并按生命周期释放', async () => {
    const registered: Array<Record<string, unknown>> = []
    const disposeRemote = vi.fn(async () => {})
    const disposeUi = vi.fn(async () => {})
    const context = {
      remote: {
        $mount: vi.fn(async () => disposeRemote),
        topicDesk: {
          list: vi.fn(),
          refresh: vi.fn(),
          translate: vi.fn(),
          queue: vi.fn(),
          unqueue: vi.fn(),
        },
      },
      locale: {
        register: vi.fn(() => () => {}),
        bind: vi.fn(() => t),
      },
      effect: vi.fn((effect: () => unknown) => effect()),
      slots: {
        inject: vi.fn((_name: string, factory: () => unknown) => factory()),
        register: vi.fn((options: Record<string, unknown>) => {
          registered.push(options)
          return () => {}
        }),
      },
      inject: vi.fn((_deps: readonly string[], callback: (ctx: unknown) => void) => {
        callback(context)
        return { then: (resolve: () => void) => Promise.resolve().then(resolve), dispose: disposeUi }
      }),
    }
    const dispose = await applyClient(context as never)
    expect(registered).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'main', key: 'topic-desk' }),
      expect.objectContaining({ name: 'sidebar.panellist', id: 'topic-desk' }),
    ]))
    await dispose()
    expect(disposeUi).toHaveBeenCalledOnce()
    expect(disposeRemote).toHaveBeenCalledOnce()
  })

  it('读取榜单、保留筛选、刷新后重查，并只以安全外链交付原文', async () => {
    const list = vi.fn(async (_query: TopicQuery) => page)
    const refresh = vi.fn(async () => ({ accepted: true, message: '刷新完成', inserted: 3, updated: 8, insertedTopicIds: [1, 2, 3] }))
    render(<TopicDeskPanel list={list} refresh={refresh} translate={async request => ({ ...request, translation: '译文' })} {...queueActions} t={t} />)

    expect(screen.getByRole('heading', { name: '选题台' })).not.toBeNull()
    const title = await screen.findByText('用于创作的话题')
    expect(screen.getByText('总排名')).not.toBeNull()
    expect(screen.getByText('07')).not.toBeNull()
    expect(screen.getByRole('option', { name: 'Hacker News · 30' })).not.toBeNull()
    expect(title.closest('a')?.getAttribute('target')).toBe('_blank')
    expect(title.closest('a')?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(document.querySelector('polyline')).not.toBeNull()
    expect(document.querySelector('textarea')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '国内' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ region: 'domestic', limit: 20, offset: 0 })))
    expect(screen.queryByRole('option', { name: 'Hacker News · 30' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '科技与 AI' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'technology' })))

    fireEvent.change(screen.getByRole('combobox', { name: '筛选平台' }), { target: { value: 'ithome' } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'ithome' })))
    expect(screen.getByText('平台排名')).not.toBeNull()
    expect(screen.getByText('01')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '刷新数据' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(screen.getByRole('status').textContent).toBe('新增 3 条 · 更新 8 条')
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({ source: 'ithome' })
    fireEvent.click(screen.getByRole('button', { name: '新增 3 条' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ topicIds: [1, 2, 3], limit: 20, offset: 0 })))
    expect(screen.getByRole('tab', { name: /本次新增 3/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('没有历史点时不绘制伪造趋势', async () => {
    render(<TopicDeskPanel
      list={async () => ({ ...page, historyEnabled: false, topics: [{ ...page.topics[0]!, trend: [], rankDelta: null }] })}
      refresh={async () => ({ accepted: true, message: '刷新完成', inserted: 0, updated: 0, insertedTopicIds: [] })}
      translate={async request => ({ ...request, translation: '译文' })}
      {...queueActions}
      t={t}
    />)
    await screen.findByText('用于创作的话题')
    expect(document.querySelector('polyline')).toBeNull()
    expect(screen.getByText('历史记录已关闭')).not.toBeNull()
  })

  it('每页只请求 20 条并可翻页', async () => {
    const list = vi.fn(async () => ({ ...page, total: 41 }))
    render(<TopicDeskPanel list={list} refresh={async () => ({ accepted: true, message: '刷新完成', inserted: 0, updated: 0, insertedTopicIds: [] })} translate={async request => ({ ...request, translation: '译文' })} {...queueActions} t={t} />)
    await screen.findByText('用于创作的话题')
    expect(screen.getByText('第 1 / 3')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 20, offset: 20 })))
    expect(screen.getByText('第 2 / 3')).not.toBeNull()
  })

  it('只为英文标题提供按需翻译，并将译文换行展示', async () => {
    let resolveTranslation!: (value: { topicId: number; translation: string }) => void
    const translate = vi.fn(() => new Promise<{ topicId: number; translation: string }>(resolve => {
      resolveTranslation = resolve
    }))
    const english = { ...page.topics[0]!, id: 2, platformCode: 'hacker-news', platformName: 'Hacker News', title: 'A practical guide to small language models' }
    render(<TopicDeskPanel
      list={async () => ({ ...page, total: 2, topics: [page.topics[0]!, english] })}
      refresh={async () => ({ accepted: true, message: '刷新完成', inserted: 0, updated: 0, insertedTopicIds: [] })}
      translate={translate}
      {...queueActions}
      t={t}
    />)
    await screen.findByText(english.title)
    expect(screen.queryByRole('button', { name: `译：${page.topics[0]!.title}` })).toBeNull()
    const button = screen.getByRole('button', { name: `译：${english.title}` })
    fireEvent.click(button)
    expect(translate).toHaveBeenCalledWith({ topicId: 2 })
    expect(screen.getByRole('button', { name: `译：${english.title}` }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/翻译中…/)).not.toBeNull()
    resolveTranslation({ topicId: 2, translation: '小型语言模型实用指南' })
    const translation = await screen.findByText(/小型语言模型实用指南/)
    expect(translation.tagName).toBe('SPAN')
    expect(translation.getAttribute('lang')).toBe('zh-CN')
    expect(screen.getByRole('button', { name: `译：${english.title}` }).hasAttribute('disabled')).toBe(true)
  })

  it('翻译失败后显示轻量重试入口', async () => {
    const english = { ...page.topics[0]!, id: 2, title: 'An English title' }
    const translate = vi.fn().mockRejectedValueOnce(new Error('model unavailable')).mockResolvedValueOnce({ topicId: 2, translation: '英文标题' })
    render(<TopicDeskPanel
      list={async () => ({ ...page, topics: [english] })}
      refresh={async () => ({ accepted: true, message: '刷新完成', inserted: 0, updated: 0, insertedTopicIds: [] })}
      translate={translate}
      {...queueActions}
      t={t}
    />)
    fireEvent.click(await screen.findByRole('button', { name: `译：${english.title}` }))
    await screen.findByText(/model unavailable/)
    fireEvent.click(screen.getByRole('button', { name: `译：${english.title}` }))
    expect(await screen.findByText(/英文标题/)).not.toBeNull()
    expect(translate).toHaveBeenCalledTimes(2)
  })

  it('加入待创作后可再次点击取消，并通过独立视图管理选题', async () => {
    const queue = vi.fn(async (request: CreationQueueRequest) => ({ ...request, queued: true }))
    const unqueue = vi.fn(async (request: CreationQueueRequest) => ({ ...request, queued: false }))
    const queuedTopic = { ...page.topics[0]!, queued: true, queuedAt: '2026-09-12T01:00:00.000Z' }
    const list = vi.fn(async (query: TopicQuery) => query.queuedOnly
      ? { ...page, queuedTotal: 1, topics: [queuedTopic] }
      : page)
    render(<TopicDeskPanel
      list={list}
      refresh={async () => ({ accepted: true, message: '刷新完成', inserted: 0, updated: 0, insertedTopicIds: [] })}
      translate={async request => ({ ...request, translation: '译文' })}
      queue={queue}
      unqueue={unqueue}
      t={t}
    />)

    const add = await screen.findByRole('button', { name: `加入待创作：${page.topics[0]!.title}` })
    fireEvent.click(add)
    await waitFor(() => expect(queue).toHaveBeenCalledWith({ topicId: 1 }))
    const remove = screen.getByRole('button', { name: `移出待创作：${page.topics[0]!.title}` })
    expect(remove.hasAttribute('disabled')).toBe(false)
    fireEvent.click(remove)
    await waitFor(() => expect(unqueue).toHaveBeenCalledWith({ topicId: 1 }))
    fireEvent.click(await screen.findByRole('button', { name: `加入待创作：${page.topics[0]!.title}` }))
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('tab', { name: /待创作 1/ }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ queuedOnly: true, limit: 20, offset: 0 })))
    fireEvent.click(await screen.findByRole('button', { name: `移出待创作：${page.topics[0]!.title}` }))
    await waitFor(() => expect(unqueue).toHaveBeenCalledWith({ topicId: 1 }))
  })
})
