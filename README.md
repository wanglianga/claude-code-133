# 景区观光车排队上车与站点调度平台

围绕“**一张车票 / 一班车**”把 **票务、排队检票、车辆、站点、司机、调度、客服、财务、退票、运营复盘** 联动起来的一体化平台。
技术栈：**React 18 + Vite + TypeScript**（前端）、**NestJS 10 + TypeORM**（后端）、**MySQL 8 / MariaDB 10.11**（数据库，开发期实际在 MariaDB 10.11 上验证，驱动为 mysql2）。

---

## 1. 能力与业务覆盖

### 票务（游客）
- 票种：**单程票、环线票（当日多段）、亲子票、无障碍优先票**；按票种/人数计价。
- 购票记录：**入园时间、起终点站、同行人数、是否携带婴儿车、老人/儿童、预计游览路线、手机号**。
- 无障碍票 / 含老人订单**自动进入优先排队通道**。
- 游客可查询本人车票、对车票发起**退票申请**；提交**团队包车**（可要求无障碍车辆）。

### 站点平板（站点工作人员）
- 一屏查看：**当前排队人数（含优先人数）、今日已检票/已上车、平均等待、到站车辆位置、普通座位余量、轮椅位余量、天气与预警、限流状态**。
- **扫码检票 → 进入排队**；上车按“**优先优先、其余先到先服务**”自动放行，也可指定票码人工放行。
- **满载跳站**登记并自动站点广播；**老人/无障碍优先争议**一键登记转客服。
- 排队过长（超过站点滞留阈值或等待预警秒数）**自动生成拥堵事件**上报调度。

### 调度中心
- 按**景点客流、车辆电量、车辆故障、司机工时、司机休息、道路/天气、站点拥堵**安排发车。
- 派班强校验：低电量（<25%）、充电中、故障维修车辆不可派；休息中 / 超时（默认 8 小时）司机不可派；同一司机不能同时承担两班。
- **暴雨临时停运 / 恢复**并全线广播；**站点限流 / 封闭**；车辆**故障登记 / 修复**；全线/单站**广播**；**天气播报**（暴雨触发停运评估事件）。
- 车辆**位置与电量上报**：偏离任一站点 1200 米判定为**电子围栏越界**并告警；低电量自动提示补能。
- 完成班次自动结算**车辆满载率（利用率快照）与司机工时**，到工时上限自动转休息。

### 司机工作台
- **发车前安全检查**：刹车、轮胎、灯光、车门、轮椅固定锁；任一项不合格即**锁定车辆为维修**并通知调度，未通过检查的班次**不能发车**。
- 上报行驶位置 / 剩余电量；**正常交班 / 交班延误登记**——延误会把**下一班自动标记为延误**并生成调度事件（影响下一班发车）。
- 开始休息 / 复班（休息与工时约束）。

### 协同事件中心（贯通六类角色）
- 统一事件类型：排队过长、满载跳站、**误上反方向**、老人优先争议、车辆故障、**司机交班延误**、暴雨停运、退票诉求、道路管制、拥堵限流、**电子围栏越界**等。
- 上车环节对**反方向 / 目的地不在本班次运行方向**的乘客**自动拦截并登记事件**（关联车票、班次、站点、车辆）。
- 每条事件可在 **站点 / 司机 / 调度 / 客服 / 客服主管 / 财务** 之间转交、接手、闭环，全部处置留痕；支持按**车票号**或**班次号**聚合追溯。

### 退票协同（游客 → 客服 → 客服主管 → 财务）
- 游客发起退票 → 客服**受理 / 同意退款 / 驳回**；驳回后车票自动恢复有效。
- 存在争议可**升级客服主管裁决**；主管同意后转财务，**仅财务可退款出账**（角色越权会被 403 拦截）。
- 退款完成后车票置为“已退票”，关联事件自动闭环；退票成本计入复盘。

### 运营复盘
- **站点等待**：平均/最长等待、今日检票、当前滞留、热门站点、限流状态。
- **车辆利用率**：各班满载率、车辆均利用率、电量、无障碍配置、运营班次。
- **投诉/异常原因分布**（按事件类型统计）。
- **退票成本**：退款笔数/金额、争议笔数、退票原因分布。
- **停运 / 跳站次数、司机工时与休息**。

---

## 2. 目录结构

```
133-a/
├─ docker-compose.yml        # 一键起 MySQL + server + web
├─ db/init.sql               # 仅建库；表结构由 TypeORM synchronize 自动创建
├─ package.json              # npm workspaces（server / web）
├─ server/                   # NestJS + TypeORM + mysql2
│  ├─ src/entities.ts        # 18 张表的领域模型与状态枚举
│  ├─ src/core.service.ts    # 核心联动逻辑（票/排队/调度/事件/退票/复盘）
│  ├─ src/controllers/       # REST API
│  ├─ src/seed.ts            # 种子数据（账号/站点/线路/车/司机/天气）
│  └─ src/e2e.ts             # 端到端校验脚本（98 项断言）
└─ web/                      # React + Vite
   └─ src/views/             # 游客/站点/司机/调度/退票/事件/复盘 视图
```

---

## 3. 本地启动

### 方式 A：Docker Compose（最快，自带 MySQL）

```bash
docker compose up --build
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001/api
- MySQL：localhost:3306（root / shuttle，库名 shuttle）

首次启动后初始化演示数据（在宿主机另开终端，或进入 server 容器执行）：

```bash
# 宿主机已自备 Node 时
npm install
npm run seed
```

### 方式 B：本地 Node + 自备 MySQL（推荐开发）

前置：Node.js ≥ 20、一个可连接的 MySQL 8 或 MariaDB 10.11+。

1) 设置数据库连接（默认值如下，按需在 `server/.env` 覆盖，参考 `server/.env.example`）：

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=shuttle
DB_NAME=shuttle
DB_SYNC=true
PORT=3001
JWT_SECRET=scenic-shuttle-dev-secret
```

数据库 `shuttle` 无需手工创建——后端启动与种子脚本会自动 `CREATE DATABASE IF NOT EXISTS`，表结构由 TypeORM 自动建立。

2) 安装依赖、初始化数据、启动：

```bash
npm install                 # 安装 workspaces 全部依赖
npm run seed                # 建库建表 + 写入种子数据
npm run dev                 # 同时启动 Nest(3001) 与 Vite(5173)
```

仅启动后端 / 前端：

```bash
npm run dev -w server       # http://127.0.0.1:3001/api
npm run dev -w web          # http://127.0.0.1:5173 （/api 已代理到 3001）
```

---

## 4. 测试账号（密码统一为 `123456`）

登录页可一键填充登录，也可手动输入：

| 账号 | 角色 | 主要界面 |
| --- | --- | --- |
| `visitor` | 游客 | 购票 / 我的车票 / 退票 / 包车 |
| `staff01` | 东门站点工作人员 | 站点平板（检票/上车/跳站/争议/广播） |
| `staff02` | 山顶站点工作人员 | 站点平板 |
| `driver01` | 司机王师傅 | 安全检查 / 位置电量 / 交班 / 休息 |
| `driver02` | 司机李师傅 | 司机工作台 |
| `dispatch` | 调度张主任 | 调度看板 / 派班班次 / 包车 / 停运限流 |
| `cs` | 客服小陈 | 退票受理/同意/驳回/争议升级 |
| `cslead` | 客服赵主管 | 争议退票裁决 |
| `finance` | 财务孙会计 | 退票出账 |
| `admin` | 管理员 | 全部界面 |

种子数据：7 个站点、2 条线路（环湖观光线 LOOP、东门—山顶直达线 UP）、5 辆车（含 1 辆低电量车）、3 名司机（含 1 名休息中）、天气与示例车票。

### 推荐手动演示路径
1. `visitor` 购买“无障碍优先票（勾选同行老人）”和普通“单程票”，记住票号。
2. `staff01` 在东门站对两张票**检票排队**，可看到无障碍票排在最前；选择班次点“放下一位”，优先票先上车。
3. `dispatch` 先派班；`driver01` 提交**安全检查**后调度才能**发车**。
4. 站点端对满载班次点“**满载跳站**”；司机端“**交班延误登记**”影响下一班。
5. `dispatch` 上报“**暴雨**”天气并对班次“**临时停运**”；对热门站点“限流”。
6. `visitor` 对车票申请退票 → `cs` 受理并“争议升级” → `cslead` 裁决同意 → `finance` 出账。
7. 用“调度中心 → 运营复盘”查看等待、利用率、投诉原因、退票成本。

---

## 5. 主要 HTTP API（均在 `/api` 前缀下，除标注外需 JWT）

- 鉴权/基础：`POST /auth/login`、`GET /auth/me`、`GET /ref`
- 游客：`POST /visitor/tickets`、`GET /visitor/tickets?phone=`、`GET /visitor/tickets/:code`、`POST /visitor/tickets/:code/refund`、`POST /visitor/charters`
- 站点：`GET /stations/:id/board`、`POST /stations/:id/checkin`、`POST /stations/:id/board`、`POST /stations/:id/skip`、`POST /stations/:id/priority-dispute`、`POST /stations/:id/broadcast`、`POST /stations/weather`
- 调度：`POST /dispatch/trips`、`GET /dispatch/trips`、`POST /dispatch/trips/:id/depart|complete|position`、`POST /dispatch/suspension`、`POST /dispatch/road-control`、`POST /dispatch/vehicles/:id/fault|repair`、`POST /dispatch/stations/:id/status`、`POST /dispatch/broadcast`、`GET/POST /dispatch/charters(/:id/assign)`
- 司机：`POST /driver/safety-check`、`POST /driver/handover`、`POST /driver/:id/rest`
- 事件：`GET /incidents`（可按 `type/status/ticketId/tripId` 过滤）、`PATCH /incidents/:id`
- 退票：`GET /refunds`、`POST /refunds/:id/cs-decide`、`POST /refunds/:id/escalate`、`POST /refunds/:id/supervisor`（仅主管）、`POST /refunds/:id/pay`（仅财务）
- 复盘：`GET /reports/overview`

---

## 6. 验证方式（均为本环境实际执行）

在真实数据库（MariaDB 10.11，mysql2 驱动连接）上完成以下验证：

1. **后端类型检查 + 编译**
   ```bash
   npm run build -w server     # tsc 编译通过，产出 dist/
   ```
2. **建库建表 + 种子**
   ```bash
   npm run seed -w server      # 自动建库并写入 18 张表与种子数据
   ```
3. **端到端业务校验（98 项断言，全部通过）**
   ```bash
   npm run test:e2e           # 等价于 seed.ts 重置数据后运行 e2e.ts
   ```
   脚本真实调用 HTTP，覆盖：四类票种购票字段 → 检票排队 → 优先/先到先得上车与座位轮椅余量 →
   低电量/故障车/休息司机派班拦截 → 安全检查未过禁止发车 → **误上反方向拦截并生成事件** →
   满载跳站+广播 → 位置电量上报+**电子围栏越界告警** → 老人优先争议 → **道路管制联动停运/广播** → 暴雨停运 →
   完成班次结算工时/利用率 → **退票“游客→客服→主管→财务”全链路（含越权 403）与驳回恢复** →
   包车无障碍车辆校验 → 故障修复 → **交班延误致下一班延误** → 天气/限流/广播 →
   运营复盘各指标 → 按车票/班次聚合追溯事件。
   最近一次输出：`结果：98 通过，0 失败`，并打印 `END_TO_END_OK`。
4. **前端类型检查与生产构建**
   ```bash
   npm run build -w web        # tsc --noEmit 通过；vite build 成功
   ```
5. **运行态冒烟**：Vite 首页与各视图模块转换均返回 200，`/api` 代理到后端成功；编译后的 `node dist/main.js` 登录返回 201、带令牌访问复盘 200、无令牌 401。
6. **数据库核对**：`information_schema` 确认 18 张表全部建立，`tickets/incidents/refunds/trips` 等表端到端后有真实落库数据。

> 说明：每次运行 `npm run test:e2e` 都会先重置（TRUNCATE）业务表再写入干净种子，因此可反复执行；脚本依赖后端已在 `http://127.0.0.1:3001` 运行（`npm run dev -w server`）。

---

## 7. 设计要点

- **单一事实源**：车票、班次是两条主线，排队记录、检票/上车日志、协同事件、退票单都挂 `ticketId / tripId`，做到“同一张票、同一班车”跨角色可追溯。
- **并发安全**：上车、发车、完成、财务出账使用悲观锁事务，避免超卖座位 / 重复退款。
- **规则内建**：优先排队、反方向拦截、电量/工时/休息/安检约束、围栏判定、拥堵自动上报均在服务端强校验，前端只负责呈现与触发。
- **状态机**：车票、班次、车辆、司机、事件、退票均有明确状态枚举（见 `server/src/entities.ts`）。
