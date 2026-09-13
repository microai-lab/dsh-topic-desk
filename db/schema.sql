-- Topic Desk SQLite 结构版本 1。
-- 约定：所有业务表都包含统一基础字段；按产品要求不声明检查约束和数据库外键约束。
-- 表间关联字段由仓储业务逻辑维护，数据库仅为查询性能创建普通索引。

-- 平台表：保存来源配置的稳定身份与最近一次完整成功运行。
CREATE TABLE platform (
  id INTEGER PRIMARY KEY,                         -- 本地自增主键
  deleted INTEGER NOT NULL DEFAULT 0,             -- 软删除标记：0 为有效，非 0 为删除
  create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 首次创建 UTC 时间
  update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 最近更新 UTC 时间
  code TEXT NOT NULL,                             -- 平台稳定代码
  display_name TEXT NOT NULL,                     -- 平台展示名称
  home_url TEXT NOT NULL,                         -- 平台首页地址
  feed_url TEXT NOT NULL,                         -- 当前采集入口地址
  enabled INTEGER NOT NULL DEFAULT 1,             -- 是否参与自动采集
  last_success_run_id INTEGER,                    -- 最近完整成功的采集运行，由业务逻辑关联
  UNIQUE (code)                                   -- 平台代码全局唯一
);

-- 采集运行表：每个平台每次计划执行都留下可诊断结果。
CREATE TABLE collection_run (
  id INTEGER PRIMARY KEY,                         -- 本地自增主键
  deleted INTEGER NOT NULL DEFAULT 0,             -- 软删除标记
  create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 运行记录创建 UTC 时间
  update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 运行状态最近更新 UTC 时间
  platform_id INTEGER NOT NULL,                   -- 所属平台
  status TEXT NOT NULL,                           -- scheduled/running/succeeded/failed/skipped
  trigger_kind TEXT NOT NULL,                     -- startup/schedule/manual
  scheduled_time TEXT NOT NULL,                   -- 计划执行 UTC 时间
  start_time TEXT,                                -- 实际开始 UTC 时间
  end_time TEXT,                                  -- 结束 UTC 时间
  fetched_count INTEGER NOT NULL DEFAULT 0,       -- Feed 返回且进入上限窗口的条数
  inserted_count INTEGER NOT NULL DEFAULT 0,      -- 新增话题数
  updated_count INTEGER NOT NULL DEFAULT 0,       -- 重复话题更新数
  invalid_count INTEGER NOT NULL DEFAULT 0,       -- 因字段无效被忽略的条数
  error_message TEXT                              -- 失败或跳过原因
);

-- 话题表：首次事实保持不变，动态字段保存最近一次成功状态。
CREATE TABLE topic (
  id INTEGER PRIMARY KEY,                         -- 本地自增主键
  deleted INTEGER NOT NULL DEFAULT 0,             -- 软删除标记
  create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 首次采集 UTC 时间
  update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 最近重复命中 UTC 时间
  platform_id INTEGER NOT NULL,                   -- 所属平台
  source_key TEXT NOT NULL,                       -- 可审计的规范化来源键
  identity_kind TEXT NOT NULL,                    -- stable_id/url/title
  dedupe_version INTEGER NOT NULL DEFAULT 1,      -- 去重算法版本
  dedupe_hash BLOB NOT NULL,                      -- SHA-256 二进制摘要
  title TEXT NOT NULL,                            -- 首次采集标题，重复命中不改写
  canonical_url TEXT NOT NULL,                    -- 首次采集原文 URL
  published_time TEXT,                            -- 来源发布时间（UTC ISO 文本）
  rank INTEGER NOT NULL,                          -- 最近一次上榜排名
  heat REAL,                                      -- 最近一次真实热度；来源未提供时为空
  last_collection_run_id INTEGER NOT NULL,        -- 最近出现的成功采集运行，由业务逻辑关联
  UNIQUE (platform_id, dedupe_hash)                -- 平台内联合哈希去重
);

-- 话题观察表：保留每次成功采集的真实排名与热度快照。
CREATE TABLE topic_observation (
  id INTEGER PRIMARY KEY,                         -- 本地自增主键
  deleted INTEGER NOT NULL DEFAULT 0,             -- 软删除标记
  create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 观察 UTC 时间
  update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 观察最近更新 UTC 时间
  topic_id INTEGER NOT NULL,                      -- 关联话题
  collection_run_id INTEGER NOT NULL,             -- 关联采集运行
  rank INTEGER NOT NULL,                          -- 本轮真实排名
  heat REAL,                                      -- 本轮真实热度；来源未提供时为空
  UNIQUE (collection_run_id, topic_id)             -- 同一运行中的话题观察幂等
);

-- 加速启用平台扫描。
CREATE INDEX idx_platform_enabled ON platform (enabled, deleted, code);
-- 加速平台运行记录与状态查询。
CREATE INDEX idx_collection_run_platform_time ON collection_run (platform_id, scheduled_time DESC, id DESC);
CREATE INDEX idx_collection_run_status ON collection_run (status, update_time DESC);
-- 加速当前榜单、热度和更新时间排序。
CREATE INDEX idx_topic_current_rank ON topic (platform_id, last_collection_run_id, rank, id);
CREATE INDEX idx_topic_heat ON topic (heat DESC, id DESC);
CREATE INDEX idx_topic_update_time ON topic (update_time DESC, id DESC);
-- 加速趋势读取和保留期清理。
CREATE INDEX idx_observation_topic_time ON topic_observation (topic_id, create_time, id);
CREATE INDEX idx_observation_create_time ON topic_observation (create_time, id);

PRAGMA user_version = 1;
