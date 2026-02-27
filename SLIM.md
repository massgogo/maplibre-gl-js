# MapLibre GL JS 精简记录

本文档记录对 maplibre-gl-js fork 的精简工作：删除 planetiler viewer 未使用的模块，为后续用 WASM 替代剩余 JS 做准备。

## 当前保留的功能

| 类别 | 保留 |
|------|------|
| Source | `vector` |
| Layer | `fill`, `line`, `circle`, `symbol`, `background` |
| UI Control | `NavigationControl`, `AttributionControl`, `LogoControl` |
| UI 组件 | `Map`, `Popup` |
| 投影 | Mercator（唯一） |
| Handler | BoxZoom, DragPan, DragRotate, ScrollZoom, DoubleClickZoom, Keyboard, CooperativeGestures, TwoFingersTouch |

## 已删除的模块（commit 5cea42e7b）

### Layer 类型（6 个）
- `heatmap` — 热力图（style layer + bucket + shaders + draw + program）
- `hillshade` — 山影（style layer + shaders + draw + program）
- `fill-extrusion` — 3D 建筑（style layer + bucket + shaders + draw + program）
- `color-relief` — 色彩浮雕（style layer + shaders + draw + program）
- `raster` — 栅格瓦片（style layer + shaders + draw + program）
- `custom` — 自定义 WebGL 层（style layer + draw）

### Source 类型（6 个）
- `geojson` — GeoJSON 数据源（source + worker source + diff）
- `image` — 图片数据源
- `raster` — 栅格瓦片数据源
- `raster-dem` — DEM 高程数据源（source + worker source + DEM data）
- `video` — 视频数据源
- `canvas` — Canvas 数据源

### UI 组件（6 个）
- `GeolocateControl` — 定位按钮
- `FullscreenControl` — 全屏按钮
- `ScaleControl` — 比例尺
- `TerrainControl` — 地形开关按钮
- `GlobeControl` — 地球/平面切换按钮
- `Marker` — 地图标记点

### 渲染系统
- Globe 投影（globe_projection, globe_transform, globe_camera_helper, globe_utils, vertical_perspective_*）
- Terrain 3D 地形（terrain.ts, terrain_tile_manager, render_to_texture, DEM 数据）
- Sky/Atmosphere 天空大气渲染（draw_sky）
- 38 个 GLSL 着色器文件（heatmap, hillshade, fill_extrusion, color_relief, raster, terrain, sky, atmosphere, projection_globe 等）
- 对应的 uniform program 文件

### 统计
- 删除文件：**~120 个**
- 删除代码：**~23,600 行**
- 修改文件：**~56 个**（清理级联引用）

## 编辑过的注册/枢纽文件

| 文件 | 改动 |
|------|------|
| `src/style/create_style_layer.ts` | 只保留 5 种 layer 的 switch case |
| `src/render/painter.ts` | 移除 8 个 draw import、terrain facilitator、renderToTexture、rasterBounds、sky/atmosphere |
| `src/shaders/shaders.ts` | 从 35 个 shader 条目减至 22 个 |
| `src/render/program/program_uniforms.ts` | 从 32 个 uniform 条目减至 18 个 |
| `src/source/source.ts` | getSourceType() 只保留 vector |
| `src/source/worker.ts` | 移除 DEM worker、GeoJSON worker、cluster 相关消息处理 |
| `src/index.ts` | 移除所有未用的 export |
| `src/geo/projection/projection_factory.ts` | 只保留 Mercator 投影 |

---

## 下一步计划

精简 JS 只是第一步（清理死代码）。后续目标是用 WASM 逐步替代剩余 JS 模块，最终实现一个极轻量的 viewer。

### Phase 2: WASM 瓦片解码（已完成）
- `planetiler-wasm` crate 已实现 MVT protobuf 解码
- 64KB WASM binary，无 prost 依赖
- 已集成到 WASM viewer 的 sidebar 数据展示

### Phase 3: WASM 样式求值
- 目标：将 style expression 求值从 JS 移到 WASM
- 范围：`interpolate`, `match`, `get`, `has`, `case`, `step` 等常用表达式
- 减少 `@maplibre/maplibre-gl-style-spec` 的 bundle 占比

### Phase 4: WASM 几何处理
- 目标：瓦片几何裁剪、简化、缓冲区计算
- 范围：worker_tile.ts 中的 bucket 填充逻辑
- 可复用 planetiler-geo crate 的 Rust 实现

### Phase 5: WASM 文本布局
- 目标：符号碰撞检测、文本 shaping、glyph atlas 生成
- 这是 maplibre 中最复杂的模块，优先级最低
- 可能保留部分 JS（如 canvas 2D 渲染、DOM 交互）

### 短期优化（不依赖 WASM）
- [ ] 删除 `vertical_perspective_projection.ts`（Globe 残留，Mercator 不需要）
- [ ] 清理 `terrain_tile_manager.ts`（仍存在，内容已空壳化）
- [ ] 移除 `_projection_mercator.vertex.glsl.g.ts` 等 `.g.ts` 生成文件中未用的 shader 变体
- [ ] 生产构建 `npm run build-prod`，对比精简前后 bundle 大小
- [ ] 清理 `test/bench/benchmarks/layers.ts` 中已删除 layer 的 benchmark class
