# DSH Topic Desk

[English](./README.md) | 简体中文

面向本机单用户创作者的 DeepSeek Harness 选题插件。Host 定时采集 49 个公开来源的热点元数据，将标准化榜单写入插件专属 SQLite，并在 DSH 侧栏提供独立的“选题台”页面。

Client 不直接访问来源网站或 SQLite，只通过生成的 DSH Remote API 查询持久化数据或触发受控刷新。

## 项目概览

| | |
|---|---|
| 包名 | `@dsh-topic-desk/plugin` |
| DSH Host 插件 ID | `topic-desk` |
| 数据来源 | 49 个公开 Feed 与数据入口 |
| 数据存储 | 本地 SQLite：`./data/topic-desk.sqlite` |
| 采集时机 | 启动时、每 10 分钟或手动触发 |
| 页面能力 | 国内外/话题分类、来源筛选、搜索、排序、每页 20 条和排名历史 |
| 运行环境 | NVM 管理的 Node.js 24.19.0；pnpm 11 |

## 内置来源

下面的分类与页面筛选完全一致。“国内/国外”按来源机构归属划分，不按单个 Feed 使用的语言划分。

| 地区 | 话题分类 | 平台 |
|---|---|---|
| 国内 | 综合 | 36氪、虎嗅、今日头条、澎湃新闻、知乎、小红书、新浪微博、抖音、B站、百度 |
| 国内 | 科技与 AI | 量子位、IT之家、C114通信、少数派、Solidot |
| 国内 | 财经市场 | 华尔街见闻、Odaily星球日报、雪球、金十数据、财联社 |
| 国外 | 综合 | Wikipedia 中文/全球、Mastodon 中文/全球、Google Trends 中文/全球、Bluesky、BBC 中文、德国之声中文、法广中文 |
| 国外 | 科技与 AI | Hugging Face、arXiv、TechCrunch、The Verge、Ars Technica、MIT Technology Review、InfoQ |
| 国外 | 财经市场 | 币安广场中文/全球、CoinGecko、Polymarket、美联储、美国 SEC、彭博社 |
| 国外 | 开发者 | Hacker News、GitHub、Stack Overflow、DEV Community、Lobsters |

各来源使用公开 RSS、Atom、JSON、网页入口及部分 Orz News 公开聚合入口。36氪、雪球和知乎的第一方入口拒绝自动访问时，会自动切换至 Orz News。不同平台的可访问性与反自动化策略并不一致；每个来源都有独立健康状态，一个来源失败不会阻塞其他来源，也不会删除它上次成功保存的话题。

## 功能

- 默认每个来源每轮最多处理 30 条内容。
- 来源提供可靠热度时保存 `heat`，否则保存为 `NULL`。
- 点击标题或箭头会在浏览器新标签页打开原文。
- 英文标题可按需点击“译”，通过 Harness 当前选中的默认模型生成简体中文译文。
- 插件不会抓取文章正文，也不会自动向聊天框写入内容。
- 平台支持全部、国内、国外分组；话题支持综合、科技与 AI、财经市场、开发者分类。
- 页面采用每页 20 条的分页，并支持来源筛选、标题搜索、排名/更新时间排序、真实排名趋势、排名升降和连续上榜轮数。
- 最多并发采集 6 个来源，避免瞬时连接过载。
- 同一来源的重叠采集会记录为 `skipped`。

## 使用选题台

所有筛选条件按“并且”组合：

```text
地区 ∩ 话题分类 ∩ 具体平台 ∩ 标题搜索
```

平台下拉框只显示符合当前地区与话题分类的平台。例如，当前开发者来源全部属于国外，因此选择“国内 + 开发者”时结果为 0；切换到“全部”或“国外”即可看到开发者话题。

切换地区、话题分类、平台、搜索词或排序方式时，页面会自动回到第一页。筛选与分页直接在 Host 的 SQLite 查询中执行，每页最多向 Client 返回 20 条，而不是把全部数据加载到浏览器后再隐藏。

## 快速开始

```bash
nvm install
nvm use
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

使用临时数据库执行一次真实采集：

```bash
pnpm demo:collect -- /tmp/topic-desk.sqlite
```

Demo 会以 JSON 输出各来源健康状态和部分话题。真实采集受网络与平台反自动化策略影响；单元测试不访问公网，结果可重复。

## Docker Compose

仓库内的多阶段 [`Dockerfile`](./Dockerfile) 会从当前 Topic Desk 源码自行构建、生成插件压缩包，再将其安装到已发布的 DeepSeek Harness Web runtime。不需要预构建的 Topic Desk 镜像、本机 DSH 安装或同级源码仓库；Docker 会在构建时选择匹配的平台架构。最终镜像只使用中性的 Linux 路径；本机依赖、构建产物、数据库、环境文件和 Host profile 均由 [`.dockerignore`](./.dockerignore) 排除，不会进入镜像。

需要安装 Docker Engine 和 Compose v2。在仓库根目录构建并启动：

```bash
docker compose up --build -d
docker compose ps
docker compose logs app
```

第一条命令会创建本地镜像 `dsh-topic-desk:local`。容器内服务监听所有接口以支持 Docker 端口转发，但 [`docker-compose.yml`](./docker-compose.yml) 默认只发布到宿主机回环地址 `127.0.0.1:3080`。使用 `docker compose logs app` 输出的带认证令牌回环 URL 访问页面。如需修改宿主端口，在启动 Compose 前设置 `DSH_PORT`。

Compose 会从当前 Shell 或仓库根目录的 `.env` 文件读取可选的非敏感运行参数。`.env` 已被 Git 忽略，也不会进入镜像：

```dotenv
DSH_PORT=3080
DSH_TELEMETRY_MODE=DISABLED
TZ=Asia/Shanghai
```

DeepSeek API Key 和自定义接口地址请在 Harness 的**设置 → 模型**页面保存。Harness 会把凭据写入 `./data/.credentials.yaml`、把模型设置写入 `./data/settings.yaml`，并监视这两个文件；保存或更换密钥后，下一次翻译请求立即使用新值，不需要重启容器。环境变量属于进程启动快照，因此 Compose 不再通过环境变量注入模型连接信息。

话题数据和 Harness 管理的模型配置都从 `./data` 挂载到容器内的 `/var/lib/topic-desk`：实时数据库位于 `./data/topic-desk.sqlite`，凭据和设置分别位于 `./data/.credentials.yaml` 与 `./data/settings.yaml`，三者在重建容器后都会保留。DSH 工作区使用名为 `dsh-topic-desk_dsh-workspace` 的 Docker 数据卷。为兼容不同 Docker 环境的目录挂载实现，容器 profile 使用 SQLite `delete` journal 模式。WAL 依赖共享内存和文件锁语义，而这些语义在不同挂载文件系统上可能存在差异；回滚日志会牺牲少量并发吞吐，但兼容性更广。复制、替换数据库或使用可写 SQLite 客户端检查数据库前，应先停止服务。

日常命令：

```bash
docker compose up -d             # 使用已有镜像启动
docker compose up --build -d     # 源码变化后重新构建
docker compose logs -f app       # 持续查看服务与采集日志
docker compose restart app       # 重启应用
docker compose down              # 停止并移除容器，保留 ./data
```

除非部署边界另有安全保护，不要把宿主端口绑定改成 `0.0.0.0`：DSH Web profile 提供了能够执行代码的 Agent 工具。`docker compose down -v` 还会删除 DSH 工作区数据卷，但不会删除目录挂载的 `./data`。

## 架构

```text
公开来源入口
   │
   ▼
Host：请求 → 校验 → 身份计算 → 持久化
   │                                │
   │                           SQLite 历史数据
   ▼
生成的 Remote API
   │
   ▼
Client：查询 → 筛选/排序 → 选题台面板
```

- `src/index.ts` 挂载 Host 服务，并将数据库和定时器清理绑定到 Cordis 生命周期。
- `src/coordinator.ts` 管理启动、定时与手动采集。
- `src/source-fetcher.ts` 将 RSS、Atom、JSON 与公开网页来源统一为话题格式。
- `src/rss.ts` 负责解析 RSS 与 Atom 元数据。
- `src/identity.ts` 生成稳定且按来源隔离的去重身份。
- `src/database.ts` 与 `src/repository.ts` 负责 SQLite 初始化、事务、查询和历史清理。
- `src/client/` 包含侧栏注册、面板、本地化和局部样式。
- `db/schema.sql` 是发布包数据库 schema 的唯一源码。

## 配置

| 配置项 | 默认值 | 说明 |
|---|---:|---|
| `databasePath` | `./data/topic-desk.sqlite` | 相对 DSH 启动工作目录的插件专属 SQLite 文件 |
| `journalMode` | `wal` | `wal`、`delete`、`truncate` 或 `persist` |
| `collectionIntervalMinutes` | `10` | 自动采集周期，正整数分钟 |
| `itemsPerPlatform` | `30` | 每个来源每轮处理的最大条数，范围 1–100 |
| `historyEnabled` | `true` | 是否保存每轮排名和热度观察 |
| `historyRetentionDays` | `30` | 历史保留天数；`0` 表示不自动清理 |
| `requestTimeoutSeconds` | `15` | 单次请求超时，范围 1–120 秒 |
| `userAgent` | `dsh-topic-desk/0.1 ...` | 来源请求使用的 User-Agent |
| `proxyUrl` | `http://127.0.0.1:7897` | 来源请求使用的 HTTP(S) 代理；留空可禁用 |
| `sources.*.enabled` | `true` | 是否启用某个来源 |
| `sources.*.feedUrl` | 内置入口 | 可替换为 HTTP(S) 镜像或测试数据入口 |

完整 Schemastery 定义见 [`src/config.ts`](./src/config.ts)。数据库位置、采集周期、条数限制、历史策略和请求行为均可配置。去重算法版本有意保持固定，避免同一数据库中的身份发生漂移。

### 网络行为

- 优先使用 `proxyUrl`；代理发生连接级错误时自动尝试直连。
- 本机没有运行代理时，可将 `proxyUrl` 留空，只使用直连。
- HTTP 错误和解析失败按来源独立记录，不会中止整轮采集。
- 36氪、雪球和知乎会先访问配置的一方入口，失败后再尝试内置公开备用入口。
- 某次采集失败不会删除该来源上一次成功提交的话题。

### 本地数据与隐私

- 数据库保存平台内稳定 ID、标题、原文 URL、发布时间、排名、可用时的热度、采集运行和排名观察。
- 不采集文章正文、账号凭据、浏览器历史或聊天内容。
- Client 只访问生成的 Remote API；来源网络请求和 SQLite 访问全部留在 Host。
- `data/` 运行数据、SQLite 辅助文件、日志、构建产物和本地环境文件均由 `.gitignore` 排除。
- 排名观察默认保留 30 天；将 `historyRetentionDays` 设为 `0` 可关闭自动历史清理。

## 数据库与去重

初始化 schema 位于 [`db/schema.sql`](./db/schema.sql)，构建时会复制到 `lib/schema.sql`。它定义四张业务表：

- `platform`：配置的来源及其健康状态。
- `collection_run`：每次按来源采集的状态和计数。
- `topic`：每个去重话题的最新持久化状态。
- `topic_observation`：用于历史趋势的排名和热度观察。

每张表都包含以下公共字段：

```sql
id          INTEGER PRIMARY KEY,
deleted     INTEGER NOT NULL DEFAULT 0,
create_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
update_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
```

按项目约定，schema 不使用 `CHECK` 或 `FOREIGN KEY`。表间关系由仓储事务维护，枚举、范围和 URL 则在配置、解析和持久化边界校验。

话题身份使用以下优先级：

1. 平台稳定 ID
2. 规范化 URL
3. 规范化标题

SHA-256 摘要输入固定为：

```text
v1\0<platform_code>\0<identity_kind>\0<normalized_identity>
```

排名、热度和采集时间不进入摘要。数据库同时保存二进制摘要和可审计的 `source_key`。命中 `(platform_id, dedupe_hash)` 后，仓储会再次比较来源键与身份类型；不一致时报告碰撞，而不是覆盖已有数据。

重复话题保留首次 `title`、`canonical_url`、`published_time` 和 `create_time`，只更新当前排名、热度、最后采集轮次、删除状态和更新时间。开启历史时，每次成功命中都会新增 `topic_observation`，用于计算真实趋势、排名变化和连续上榜轮数。

## 命令参考

`.nvmrc` 固定 Node.js `24.19.0`，`package.json` 固定 pnpm 11。执行 `nvm use` 后，从仓库根目录运行命令。

| 命令 | 用途 |
|---|---|
| `pnpm typecheck` | 编译严格的 Host/Client TypeScript 契约并重新生成 Typert 元数据 |
| `pnpm test` | 运行不访问公网的 Host、仓储、解析器和 UI 确定性测试 |
| `pnpm build` | 生成 Host/Client bundle、声明、Remote 工件、source map 和打包 schema |
| `pnpm demo:collect -- <路径>` | 使用显式 SQLite 路径对全部启用来源执行真实采集 |
| `pnpm pack` | 生成可安装的插件压缩包 |

## 真实采集 Demo

使用显式数据库路径运行真实采集：

```bash
pnpm demo:collect -- /tmp/topic-desk.sqlite
```

不传路径时，命令会写入 `./data/topic-desk.sqlite`。对同一路径运行两次，应看到话题总数保持稳定、`consecutiveRuns` 从 1 增至 2，并产生两个真实趋势点。

## 常见问题

| 现象 | 检查方法 |
|---|---|
| 某个话题分类没有数据 | 先检查地区筛选。筛选条件取交集，例如开发者分类目前只有国外平台。 |
| 所有国外来源都失败 | 检查 `proxyUrl` 指向的服务，或将它留空以只使用直连。 |
| 单个平台显示失败 | 查看 Host 日志或该平台最新的 `collection_run`，再检查入口覆盖配置和平台可用性；其他平台仍会正常采集。 |
| 数据没有及时更新 | 点击“立即采集”，检查最新的 `collection_run` 与 `collectionIntervalMinutes`。 |
| 找不到数据库文件 | 相对 `databasePath` 以 DSH 进程工作目录为基准；也可以配置绝对路径。 |
| 构建结果没有更新 | 先执行 `nvm use`，再运行 `pnpm typecheck`、`pnpm test`、`pnpm build`；不要直接修改 `lib/`。 |

## 安装到 DeepSeek Harness

构建并打包插件，然后将生成的压缩包加入目标 profile：

```bash
pnpm build
pnpm pack
dsh plugin --profile <你的-profile> add ./dsh-topic-desk-plugin-0.1.0.tgz
```

发布包包含 `cordis.patch.yml`，Host 插件 ID 为 `topic-desk`，Client 入口由 `dsh.client` 自动发现。启动 profile 后，侧栏会出现“选题台”。列表数据始终来自本地 SQLite；只有定时采集和“立即刷新”会访问配置的来源入口。

## 构建说明

`@deepseek-ai/dsh-typert-generator@0.1.5-rc.1` 只会从 workspace 扫描范围内的包发现协议元数据。本仓库将真实插件保留在根目录，并使用私有且不发布的 `packages/_build/typert-protocol` 桥与一次性的构建期 workspace 镜像。该桥转发到官方 rc.2 runtime，而发布包仍将 `@deepseek-ai/dsh-typert-protocol` 声明为 peer dependency。

插件不依赖相邻的 `deepseek-harness` 源码 checkout。

## 许可证

[MIT](./LICENSE)
