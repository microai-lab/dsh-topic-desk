<div align="center">

# DSH Topic Desk

**面向 DeepSeek Harness 的本地优先热点选题台**

采集 49 个公开来源，追踪真实排名趋势，把值得写的内容沉淀到待创作清单。

[English](./README.md) · **简体中文**

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-0.1.5--rc.2-4f46e5?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js](https://img.shields.io/badge/Node.js-24.19.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-local--first-003b57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Docker Compose](https://img.shields.io/badge/Docker_Compose-ready-2496ed?style=flat-square&logo=docker&logoColor=white)](./docker-compose.yml)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)

</div>

> [!NOTE]
> Topic Desk 面向本机单用户场景。Client 不直接访问来源网站或 SQLite，只通过生成的 DSH Remote API 查询持久化数据或触发受控刷新。

## 导航

- [核心能力](#核心能力)
- [快速开始](#快速开始)
- [Docker Compose](#docker-compose)
- [内置来源](#内置来源)
- [工作方式](#工作方式)
- [配置](#配置)
- [数据与隐私](#本地数据与隐私)
- [常见问题](#常见问题)

## 项目概览

| | |
|---|---|
| 包名 | `@dsh-topic-desk/plugin` |
| DSH Host 插件 ID | `topic-desk` |
| 数据来源 | 49 个公开 Feed 与数据入口 |
| 数据存储 | 本地 SQLite：`./data/topic-desk.sqlite` |
| 采集时机 | 启动时、每 10 分钟或手动触发 |
| 页面能力 | 多维筛选、总排名、趋势、刷新统计、本次新增与待创作清单 |
| 运行环境 | NVM 管理的 Node.js 24.19.0；pnpm 11 |

## 核心能力

| 🔥 热点发现 | 📈 排名追踪 | ✍️ 创作工作流 | 🔒 本地优先 |
|---|---|---|---|
| 聚合 49 个国内外公开来源，按地区、类别和平台筛选 | 全平台展示总排名，单平台保留原始排名与真实趋势 | 查看本次新增，一键加入或移出持久化待创作清单 | 话题、配置与凭据留在本机，Client 通过 Remote API 访问 |

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
- 可将感兴趣的话题加入持久化的“待创作”列表，再次点击即可移出；掉出当前榜单后仍会保留。
- 插件不会抓取文章正文，也不会自动向聊天框写入内容。
- 平台支持全部、国内、国外分组；话题支持综合、科技与 AI、财经市场、开发者分类。
- 页面采用每页 20 条的分页，并支持来源筛选、标题搜索、排名/更新时间排序；全部平台显示合并后的总排名，单个平台显示其平台排名，同时保留真实排名趋势、排名升降和连续上榜轮数。
- 最多并发采集 6 个来源，避免瞬时连接过载。
- 同一来源的重叠采集会记录为 `skipped`。
- 每次手动刷新后显示本轮真实新增和更新的选题数量；点击新增数量可打开本次新增的可搜索列表。

## 使用选题台

所有筛选条件按“并且”组合：

```text
地区 ∩ 话题分类 ∩ 具体平台 ∩ 标题搜索
```

平台下拉框只显示符合当前地区与话题分类的平台。例如，当前开发者来源全部属于国外，因此选择“国内 + 开发者”时结果为 0；切换到“全部”或“国外”即可看到开发者话题。

切换地区、话题分类、平台、搜索词或排序方式时，页面会自动回到第一页。筛选与分页直接在 Host 的 SQLite 查询中执行，每页最多向 Client 返回 20 条，而不是把全部数据加载到浏览器后再隐藏。

## 快速开始

```bash
docker compose up --build -d
docker compose logs app
```

打开日志输出的带认证令牌 URL 即可进入选题台。话题数据库、模型配置和 Harness 运行数据均按下文说明持久化；后续启动只需运行 `docker compose up -d`。

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

话题数据和 Harness 管理的模型配置都从 `./data` 挂载到容器内的 `/var/lib/topic-desk`：实时数据库位于 `./data/topic-desk.sqlite`，凭据和设置分别位于 `./data/.credentials.yaml` 与 `./data/settings.yaml`。仓库会忽略整个 `./data` 目录、所有 `.env` 变体以及 Harness 凭据文件名，模型 Key 和运行数据不会进入 Git。

Harness 运行数据分别使用 Docker named volume 持久化：`dsh-sessions` 保存会话日志，`dsh-storages` 保存工作区注册等内部状态，`dsh-attachments` 保存上传文件，`dsh-agent-presets` 保存用户自定义 Agent 预设，`dsh-workspace` 保存工作区文件。Compose 会在这些名称前加上项目名，例如 `dsh-topic-desk_dsh-sessions`。镜像管理的 profile 和插件依赖仍保留在镜像中，因此重新构建可以应用 profile 与插件更新，同时不会覆盖用户持久化数据。

为兼容不同 Docker 环境的目录挂载实现，容器 profile 使用 SQLite `delete` journal 模式。WAL 依赖共享内存和文件锁语义，而这些语义在不同挂载文件系统上可能存在差异；回滚日志会牺牲少量并发吞吐，但兼容性更广。复制、替换数据库或使用可写 SQLite 客户端检查数据库前，应先停止服务。

日常命令：

```bash
docker compose up -d             # 使用已有镜像启动
docker compose up --build -d     # 源码变化后重新构建
docker compose logs -f app       # 持续查看服务与采集日志
docker compose restart app       # 重启应用
docker compose down              # 停止并移除容器，保留 ./data
```

除非部署边界另有安全保护，不要把宿主端口绑定改成 `0.0.0.0`：DSH Web profile 提供了能够执行代码的 Agent 工具。`docker compose down -v` 会删除全部 Harness named volume，包括会话、附件、内部状态、预设和工作区文件，但不会删除目录挂载的 `./data`。日常维护请使用普通的 `docker compose down`。

## 工作方式

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

项目采用 DeepSeek Harness 的 Host/Client 插件结构：Host 负责采集、去重、调度和 SQLite 持久化，Client 只通过 Remote API 展示和操作选题。具体框架实现不影响日常使用和运维。

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

## 业务数据

SQLite 保存来源状态、每轮采集结果、去重后的选题、排名趋势以及待创作清单。

话题按平台提供的稳定 ID、规范化 URL 或标题依次去重。重复采集会保留首次记录，更新当前排名、热度和采集状态；开启历史后会继续记录排名观察，用于趋势、升降和连续上榜统计。

## 开发与验证

`.nvmrc` 固定 Node.js `24.19.0`，`package.json` 固定 pnpm 11。执行 `nvm use` 后，从仓库根目录运行命令。

| 命令 | 用途 |
|---|---|
| `pnpm typecheck` | 检查 Host 与 Client 的 TypeScript 类型 |
| `pnpm test` | 运行不访问公网的 Host、仓储、解析器和 UI 确定性测试 |
| `pnpm build` | 生成 Host/Client bundle、声明、Remote 工件、source map 和打包 schema |
| `pnpm pack` | 生成可安装的插件压缩包 |

## 常见问题

| 现象 | 检查方法 |
|---|---|
| 某个话题分类没有数据 | 先检查地区筛选。筛选条件取交集，例如开发者分类目前只有国外平台。 |
| 所有国外来源都失败 | 检查 `proxyUrl` 指向的服务，或将它留空以只使用直连。 |
| 单个平台显示失败 | 查看 Host 日志或该平台最新的 `collection_run`，再检查入口覆盖配置和平台可用性；其他平台仍会正常采集。 |
| 数据没有及时更新 | 点击“刷新数据”，查看页面显示的新增/更新数量，并检查最新的 `collection_run` 与 `collectionIntervalMinutes`。 |
| 找不到数据库文件 | 相对 `databasePath` 以 DSH 进程工作目录为基准；也可以配置绝对路径。 |
| 构建结果没有更新 | 先执行 `nvm use`，再运行 `pnpm typecheck`、`pnpm test`、`pnpm build`；不要直接修改 `lib/`。 |

## 安装到 DeepSeek Harness

构建并打包插件，然后将生成的压缩包加入目标 profile：

```bash
pnpm build
pnpm pack
dsh plugin --profile <你的-profile> add ./dsh-topic-desk-plugin-0.1.0.tgz
```

发布包包含 `cordis.patch.yml`，Host 插件 ID 为 `topic-desk`，Client 入口由 `dsh.client` 自动发现。启动 profile 后，侧栏会出现“选题台”。列表数据始终来自本地 SQLite；只有定时采集和“刷新数据”会访问配置的来源入口。

## 许可证

[MIT](./LICENSE)
