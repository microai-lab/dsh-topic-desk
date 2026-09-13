import type { PlatformCode, SourceRegion, TopicCategory } from './types.ts'

export interface PlatformCatalogEntry {
  readonly code: PlatformCode
  readonly displayName: string
  readonly homeUrl: string
  readonly endpointUrl: string
}

/** 产品内置平台目录。endpointUrl 可通过 sources.<code>.feedUrl 覆盖。 */
export const platformCatalog: readonly PlatformCatalogEntry[] = [
  { code: 'qbitai', displayName: '量子位', homeUrl: 'https://www.qbitai.com/', endpointUrl: 'https://www.qbitai.com/feed' },
  { code: 'ithome', displayName: 'IT之家', homeUrl: 'https://www.ithome.com/', endpointUrl: 'https://www.ithome.com/rss/' },
  { code: '36kr', displayName: '36氪', homeUrl: 'https://36kr.com/', endpointUrl: 'https://36kr.com/hot-list/catalog' },
  { code: 'huxiu', displayName: '虎嗅', homeUrl: 'https://www.huxiu.com/', endpointUrl: 'https://www.huxiu.com/' },
  { code: 'c114', displayName: 'C114通信', homeUrl: 'https://www.c114.com.cn/', endpointUrl: 'https://www.c114.com.cn/' },
  { code: 'wallstreetcn', displayName: '华尔街见闻', homeUrl: 'https://wallstreetcn.com/', endpointUrl: 'https://wallstreetcn.com/' },
  { code: 'odaily', displayName: 'Odaily星球日报', homeUrl: 'https://www.odaily.news/', endpointUrl: 'https://www.odaily.news/' },
  { code: 'xueqiu', displayName: '雪球', homeUrl: 'https://xueqiu.com/', endpointUrl: 'https://xueqiu.com/today' },
  { code: 'toutiao', displayName: '今日头条', homeUrl: 'https://www.toutiao.com/', endpointUrl: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc' },
  { code: 'thepaper', displayName: '澎湃新闻', homeUrl: 'https://www.thepaper.cn/', endpointUrl: 'https://www.thepaper.cn/' },
  { code: 'zhihu', displayName: '知乎', homeUrl: 'https://www.zhihu.com/', endpointUrl: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=100&desktop=true' },
  { code: 'binance-square-zh', displayName: '币安广场中文', homeUrl: 'https://www.binance.com/zh-CN/square', endpointUrl: 'https://www.binance.com/bapi/composite/v3/friendly/pgc/content/article/list?pageIndex=1&pageSize=20&type=1' },
  { code: 'binance-square-global', displayName: '币安广场全球', homeUrl: 'https://www.binance.com/en/square', endpointUrl: 'https://www.binance.com/bapi/composite/v3/friendly/pgc/content/article/list?pageIndex=1&pageSize=20&type=1' },
  { code: 'hacker-news', displayName: 'Hacker News', homeUrl: 'https://news.ycombinator.com/', endpointUrl: 'https://hacker-news.firebaseio.com/v0' },
  { code: 'wikipedia-zh', displayName: 'Wikipedia 中文', homeUrl: 'https://zh.wikipedia.org/', endpointUrl: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/zh.wikipedia/all-access' },
  { code: 'wikipedia-global', displayName: 'Wikipedia 全球', homeUrl: 'https://en.wikipedia.org/', endpointUrl: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access' },
  { code: 'mastodon-zh', displayName: 'Mastodon 中文', homeUrl: 'https://m.cmx.im/', endpointUrl: 'https://m.cmx.im/api/v1/trends/statuses?limit=40' },
  { code: 'mastodon-global', displayName: 'Mastodon 全球', homeUrl: 'https://mastodon.social/', endpointUrl: 'https://mastodon.social/api/v1/trends/links?limit=40' },
  { code: 'google-trends-zh', displayName: 'Google Trends 中文', homeUrl: 'https://trends.google.com/trending?geo=TW', endpointUrl: 'https://trends.google.com/trending/rss?geo=TW' },
  { code: 'google-trends-global', displayName: 'Google Trends 全球', homeUrl: 'https://trends.google.com/trending?geo=US', endpointUrl: 'https://trends.google.com/trending/rss?geo=US' },
  { code: 'coingecko', displayName: 'CoinGecko', homeUrl: 'https://www.coingecko.com/', endpointUrl: 'https://api.coingecko.com/api/v3/search/trending' },
  { code: 'github', displayName: 'GitHub', homeUrl: 'https://github.com/trending', endpointUrl: 'https://github.com/trending?since=daily' },
  { code: 'hugging-face', displayName: 'Hugging Face', homeUrl: 'https://huggingface.co/papers', endpointUrl: 'https://huggingface.co/api/daily_papers' },
  { code: 'arxiv', displayName: 'arXiv', homeUrl: 'https://arxiv.org/', endpointUrl: 'https://arxiv.org/list/cs.AI/recent?skip=0&show=100' },
  { code: 'bluesky', displayName: 'Bluesky', homeUrl: 'https://bsky.app/', endpointUrl: 'https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics' },
  { code: 'polymarket', displayName: 'Polymarket', homeUrl: 'https://polymarket.com/', endpointUrl: 'https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=100' },
  { code: 'stack-overflow', displayName: 'Stack Overflow', homeUrl: 'https://stackoverflow.com/', endpointUrl: 'https://api.stackexchange.com/2.3/questions?site=stackoverflow&sort=hot&pagesize=100&filter=default' },
  { code: 'dev-community', displayName: 'DEV Community', homeUrl: 'https://dev.to/', endpointUrl: 'https://dev.to/api/articles?top=1&per_page=100' },
  { code: 'lobsters', displayName: 'Lobsters', homeUrl: 'https://lobste.rs/', endpointUrl: 'https://lobste.rs/rss' },
  { code: 'techcrunch', displayName: 'TechCrunch', homeUrl: 'https://techcrunch.com/', endpointUrl: 'https://techcrunch.com/feed/' },
  { code: 'federal-reserve', displayName: '美联储', homeUrl: 'https://www.federalreserve.gov/', endpointUrl: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { code: 'sec', displayName: '美国 SEC', homeUrl: 'https://www.sec.gov/', endpointUrl: 'https://www.sec.gov/news/pressreleases.rss' },
  { code: 'bbc-chinese', displayName: 'BBC 中文', homeUrl: 'https://www.bbc.com/zhongwen/simp', endpointUrl: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml' },
  { code: 'dw-chinese', displayName: '德国之声中文', homeUrl: 'https://www.dw.com/zh/', endpointUrl: 'https://rss.dw.com/rdf/rss-chi-all' },
  { code: 'rfi-chinese', displayName: '法广中文', homeUrl: 'https://www.rfi.fr/cn/', endpointUrl: 'https://www.rfi.fr/cn/rss' },
  { code: 'bloomberg', displayName: '彭博社', homeUrl: 'https://www.bloomberg.com/', endpointUrl: 'https://feeds.bloomberg.com/markets/news.rss' },
  { code: 'jin10', displayName: '金十数据', homeUrl: 'https://www.jin10.com/', endpointUrl: 'https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1' },
  { code: 'cls', displayName: '财联社', homeUrl: 'https://www.cls.cn/', endpointUrl: 'https://news.orz.ai/api/v1/dailynews/?platform=cls' },
  { code: 'xiaohongshu', displayName: '小红书', homeUrl: 'https://www.xiaohongshu.com/', endpointUrl: 'https://www.xiaohongshu.com/explore' },
  { code: 'weibo', displayName: '新浪微博', homeUrl: 'https://weibo.com/', endpointUrl: 'https://news.orz.ai/api/v1/dailynews/?platform=weibo' },
  { code: 'douyin', displayName: '抖音', homeUrl: 'https://www.douyin.com/', endpointUrl: 'https://news.orz.ai/api/v1/dailynews/?platform=douyin' },
  { code: 'bilibili', displayName: 'B站', homeUrl: 'https://www.bilibili.com/', endpointUrl: 'https://news.orz.ai/api/v1/dailynews/?platform=bilibili' },
  { code: 'baidu', displayName: '百度', homeUrl: 'https://top.baidu.com/', endpointUrl: 'https://news.orz.ai/api/v1/dailynews/?platform=baidu' },
  { code: 'the-verge', displayName: 'The Verge', homeUrl: 'https://www.theverge.com/', endpointUrl: 'https://www.theverge.com/rss/index.xml' },
  { code: 'ars-technica', displayName: 'Ars Technica', homeUrl: 'https://arstechnica.com/', endpointUrl: 'https://feeds.arstechnica.com/arstechnica/index' },
  { code: 'mit-technology-review', displayName: 'MIT Technology Review', homeUrl: 'https://www.technologyreview.com/', endpointUrl: 'https://www.technologyreview.com/feed/' },
  { code: 'infoq', displayName: 'InfoQ', homeUrl: 'https://www.infoq.com/', endpointUrl: 'https://feed.infoq.com/' },
  { code: 'sspai', displayName: '少数派', homeUrl: 'https://sspai.com/', endpointUrl: 'https://sspai.com/feed' },
  { code: 'solidot', displayName: 'Solidot', homeUrl: 'https://www.solidot.org/', endpointUrl: 'https://rss.solidot.org/index.rss' },
]

export const platformByCode = new Map(platformCatalog.map(platform => [platform.code, platform]))

export const domesticPlatformCodes = new Set<PlatformCode>([
  'qbitai', 'ithome', '36kr', 'huxiu', 'c114', 'wallstreetcn', 'odaily', 'xueqiu', 'toutiao', 'thepaper',
  'zhihu', 'jin10', 'cls', 'xiaohongshu', 'weibo', 'douyin', 'bilibili', 'baidu', 'sspai', 'solidot',
])

export const topicCategoryByPlatform = {
  qbitai: 'technology',
  ithome: 'technology',
  '36kr': 'general',
  huxiu: 'general',
  c114: 'technology',
  wallstreetcn: 'finance',
  odaily: 'finance',
  xueqiu: 'finance',
  toutiao: 'general',
  thepaper: 'general',
  zhihu: 'general',
  'binance-square-zh': 'finance',
  'binance-square-global': 'finance',
  'hacker-news': 'developer',
  'wikipedia-zh': 'general',
  'wikipedia-global': 'general',
  'mastodon-zh': 'general',
  'mastodon-global': 'general',
  'google-trends-zh': 'general',
  'google-trends-global': 'general',
  coingecko: 'finance',
  github: 'developer',
  'hugging-face': 'technology',
  arxiv: 'technology',
  bluesky: 'general',
  polymarket: 'finance',
  'stack-overflow': 'developer',
  'dev-community': 'developer',
  lobsters: 'developer',
  techcrunch: 'technology',
  'federal-reserve': 'finance',
  sec: 'finance',
  'bbc-chinese': 'general',
  'dw-chinese': 'general',
  'rfi-chinese': 'general',
  bloomberg: 'finance',
  jin10: 'finance',
  cls: 'finance',
  xiaohongshu: 'general',
  weibo: 'general',
  douyin: 'general',
  bilibili: 'general',
  baidu: 'general',
  'the-verge': 'technology',
  'ars-technica': 'technology',
  'mit-technology-review': 'technology',
  infoq: 'technology',
  sspai: 'technology',
  solidot: 'technology',
} as const satisfies Record<PlatformCode, TopicCategory>

export function platformRegion(code: string): SourceRegion {
  return domesticPlatformCodes.has(code as PlatformCode) ? 'domestic' : 'international'
}

export function platformCategory(code: string): TopicCategory {
  return topicCategoryByPlatform[code as PlatformCode] ?? 'general'
}
