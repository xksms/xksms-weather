# xksms-weather · 小雨团雨雪地图

> **English summary:** A mobile-first, "cute" rain/snow map of China built with React 19, TypeScript, Vite and MapLibre GL. It renders country / province / city boundaries from bundled GeoJSON and lazily loads district boundaries for the cities in view from the companion Spring Boot backend [xksms/xksms-weather-java](https://github.com/xksms/xksms-weather-java). The goal is "look at the weather, not look it up": a map you want to screenshot and share. Work in progress. License: MIT.

「小雨团 · 雨雪地图」的前端。目标是让人**一眼看到中国哪里在下雨 / 下雪**：专注"看天气"而不是"查天气"，用可爱的视觉和地图交互，做出截图就能分享的天气地图。

- 后端仓库：[xksms/xksms-weather-java](https://github.com/xksms/xksms-weather-java)
- 状态：开发中（个人维护的开源项目）

## 已实现

- **多层级行政区划地图**（MapLibre GL）
  - 全国轮廓、省界、市界来自仓库内置的 GeoJSON（`public/data/`）。
  - 按缩放级别自动切换显示层级：省（< 6 级）→ 市（6–11 级）→ 区县（≥ 9 级）。
  - 放大到 8 级以上时，查询当前视野内所有城市，**按需**向后端 `/api/geo/{adcode}` 拉取区县边界，合并渲染，并做去重与失败重试。
- **交互**：悬停高亮 + 气泡，点击区域平滑飞行缩放；地图范围锁定在中国附近。
- **产品规划页** `/plan`：设计原则、核心功能范围、趣味模式、分享卡片和 7 天上线节奏。
- 三套天气风格 favicon（雨 / 雪 / 夜雪）。

> 说明：目前悬停气泡里的天气是**前端模拟数据**，接入后端 `/api/weather/{adcode}` 的真实天气在路线图中。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 19 + TypeScript 5.9 |
| 构建 | Vite 7 |
| 地图 | MapLibre GL 5 |
| 路由 | React Router 7 |
| 样式 | CSS、Tailwind CSS 4 / PostCSS |
| 代码规范 | ESLint 9 + typescript-eslint |

## 项目结构

```
├── index.html                # 页面入口（标题：小雨团 · 雨雪地图）
├── vite.config.ts            # 开发代理：/api → 后端，/amap → 高德
├── public/
│   ├── data/
│   │   ├── china.json        # 全国轮廓
│   │   ├── provinces.json    # 省级边界
│   │   └── city.json         # 市级边界
│   └── favicon-*.svg         # 天气风格图标
└── src/
    ├── main.tsx
    ├── App.tsx               # 路由：/ 地图首页，/plan 规划页
    ├── pages/
    │   ├── MapHome.tsx       # 地图主页面（图层、交互、区县按需加载）
    │   └── Planning.tsx      # 产品规划页
    └── css/Map.css
```

## 快速开始

环境要求：Node.js 20.19+ 或 22.12+（Vite 7 的要求）。

```bash
git clone https://github.com/xksms/xksms-weather.git
cd xksms-weather
npm install

npm run dev       # 开发模式，默认 http://localhost:5173
npm run build     # 类型检查 + 生产构建，输出到 dist/
npm run preview   # 本地预览生产构建
npm run lint      # ESLint 检查
```

区县边界需要后端支持：先按[后端 README](https://github.com/xksms/xksms-weather-java#快速开始) 在 `8758` 端口启动 `xksms-weather-java`，开发服务器会把 `/api` 请求代理过去。不启动后端时，全国 / 省 / 市三级地图照常显示，只是放大后不会出现区县。

## 配置

| 配置 | 位置 | 说明 |
| --- | --- | --- |
| 后端地址 | `vite.config.ts` → `server.proxy['/api'].target` | 默认 `http://localhost:8758` |
| 高德代理 | `vite.config.ts` → `server.proxy['/amap']` | 转发到 `https://restapi.amap.com`（预留） |
| `VITE_AMAP_KEY` | `.env.local` | 高德 Web 服务 Key（预留，可不填） |

`.env.local` 已被 `.gitignore`（`*.local`）忽略，**不要把真实 Key 提交到仓库**：

```bash
# .env.local
VITE_AMAP_KEY=<你的高德 Key>
```

## 路线图

- [ ] 接入后端真实天气，地图上只展示正在下雨 / 下雪的城市
- [ ] 可爱天气图标（含降水强度与昼夜模式）
- [ ] 缩放聚合：城市 → 站点
- [ ] 点击城市弹出天气卡片、搜索城市并飞到位置
- [ ] 趣味模式：「今天中国哪里在下雪？」「现在，雨最猛的地方」
- [ ] 一键生成分享卡片（城市名 + 大图标 + 时间戳）

## 参与贡献

欢迎提 Issue 和 Pull Request。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源，Copyright (c) 2026 xksms。

行政区划边界数据来自[阿里云 DataV](https://datav.aliyun.com/)，使用时请遵守其条款。
