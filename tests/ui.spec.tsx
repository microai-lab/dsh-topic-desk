// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopicDeskPanel } from '../src/client/TopicDeskPanel.tsx'
import { apply as applyClient } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import type { TopicPage, TopicQuery } from '../src/types.ts'

afterEach(cleanup)

const page: TopicPage = {
  total: 1,
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
    rank: 1,
    heat: null,
    firstSeenAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:10:00.000Z',
    rankDelta: 2,
    consecutiveRuns: 2,
    trend: [3, 1],
  }],
}

const t = (key: string): string => zh[key as keyof typeof zh] ?? key

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
    const refresh = vi.fn(async () => ({ accepted: true, message: '刷新完成' }))
    render(<TopicDeskPanel list={list} refresh={refresh} t={t} />)

    expect(screen.getByRole('heading', { name: '选题台' })).not.toBeNull()
    const title = await screen.findByText('用于创作的话题')
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
    fireEvent.click(screen.getByRole('button', { name: '立即采集' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({ source: 'ithome' })
  })

  it('没有历史点时不绘制伪造趋势', async () => {
    render(<TopicDeskPanel
      list={async () => ({ ...page, historyEnabled: false, topics: [{ ...page.topics[0]!, trend: [], rankDelta: null }] })}
      refresh={async () => ({ accepted: true, message: '刷新完成' })}
      t={t}
    />)
    await screen.findByText('用于创作的话题')
    expect(document.querySelector('polyline')).toBeNull()
    expect(screen.getByText('历史记录已关闭')).not.toBeNull()
  })

  it('每页只请求 20 条并可翻页', async () => {
    const list = vi.fn(async () => ({ ...page, total: 41 }))
    render(<TopicDeskPanel list={list} refresh={async () => ({ accepted: true, message: '刷新完成' })} t={t} />)
    await screen.findByText('用于创作的话题')
    expect(screen.getByText('第 1 / 3')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 20, offset: 20 })))
    expect(screen.getByText('第 2 / 3')).not.toBeNull()
  })
})
