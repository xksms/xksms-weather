import {useEffect, useMemo, useRef} from 'react' // 引入 React 核心钩子：生命周期、记忆化计算、引用
import maplibregl, {type GeoJSONSource, type LngLatBoundsLike} from 'maplibre-gl' // 引入 MapLibre 地图库及其类型定义
import 'maplibre-gl/dist/maplibre-gl.css' // 引入 MapLibre 默认样式表
import '../App.css' // 引入全局应用样式
import '../css/Map.css' // 引入地图专属自定义样式

type DistrictLevel = 'country' | 'province' | 'city' | 'district' // 定义行政区划级别类型

type AmapDistrict = { // 定义高德 API 返回的行政区数据结构
    name: string // 区域名称
    adcode: string // 区域编码
    level: DistrictLevel // 区域级别
    polyline?: string // 区域边界坐标序列（字符串格式）
}

type AmapDistrictResponse = { // 定义高德 API 响应的整体结构
    status: '0' | '1' // 状态码：1 成功，0 失败
    info: string // 响应信息
    infocode: string // 响应状态码
    districts: AmapDistrict[] // 行政区列表
}

type AdminProps = { name: string; adcode: string; level: DistrictLevel } // 定义 GeoJSON 属性的类型
type AdminFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, AdminProps> // 定义 GeoJSON 要素类型
type AdminFC = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AdminProps> // 定义 GeoJSON 要素集合类型

// 1. 定义中国的核心范围（包含南海诸岛）
const CORE_CHINA_BOUNDS: [[number, number], [number, number]] = [
    [73.4, 3.5],   // 西南 (曾母暗沙附近)
    [135.1, 53.6], // 东北 (黑龙江漠河)
];

// 2. 优化 maxBounds 的计算函数
function getOptimizedMaxBounds(padding: number = 5): LngLatBoundsLike {
    const [sw, ne] = CORE_CHINA_BOUNDS;
    return [
        [sw[0] - padding, sw[1] - padding], // 向西南扩展
        [ne[0] + padding, ne[1] + padding], // 向东北扩展
    ];
}

const MAX_BOUNDS = getOptimizedMaxBounds(8); // 给四周留出 8 度的缓冲空间

// 将高德返回的字符串格式 polyline 转换为 GeoJSON 标准几何对象的函数
function polylineToGeometry(polyline: string): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
    const parts = polyline // 获取 polyline 字符串
        .split('|') // 高德多面体以 | 分隔
        .map((s) => s.trim()) // 去除两端空格
        .filter(Boolean) // 过滤掉空字符串

    const polygons: number[][][] = [] // 初始化多边形坐标数组

    for (const seg of parts) { // 遍历每一个分割后的片段
        const ring = seg // 处理每一个环
            .split(';') // 环内的坐标点以 ; 分隔
            .map((pt) => pt.trim()) // 去除点坐标的空格
            .filter(Boolean) // 过滤空坐标点
            .map((pt) => { // 将字符串坐标转换为数字数组
                const [lngStr, latStr] = pt.split(',') // 以逗号分割经纬度
                const lng = Number(lngStr) // 转换为经度数字
                const lat = Number(latStr) // 转换为纬度数字
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null // 验证数字有效性
                return [lng, lat] as [number, number] // 返回标准坐标元组
            })
            .filter((v): v is [number, number] => v !== null) // 过滤掉无效点

        if (ring.length < 3) continue // 如果点数不足以构成面，跳过

        const first = ring[0] // 获取环的第一个点
        const last = ring[ring.length - 1] // 获取环的最后一个点
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first) // 如果不闭合，手动将起点添加至末尾

        polygons.push(ring) // 将处理好的环放入多边形数组中
    }

    if (polygons.length === 0) return null // 如果没有任何多边形，返回空
    if (polygons.length === 1) return {type: 'Polygon', coordinates: [polygons[0]]} // 如果只有一个面，返回 Polygon 类型
    return {type: 'MultiPolygon', coordinates: polygons.map((r) => [r])} // 如果有多个面，返回 MultiPolygon 类型
}

// 异步获取中国行政轮廓的函数
async function fetchChinaOutline(key: string): Promise<AmapDistrict> {
    const url = new URL('/amap/v3/config/district', window.location.origin) // 构造高德 API 的 URL（这里用了代理地址）
    url.searchParams.set('key', key) // 设置 API 密钥
    url.searchParams.set('keywords', '中国') // 设置查询关键字为中国
    url.searchParams.set('subdistrict', '0') // 设置不获取下级行政区
    url.searchParams.set('extensions', 'all') // 设置返回所有信息（包含边界 polyline）
    url.searchParams.set('page', '1') // 分页：第1页
    url.searchParams.set('offset', '1') // 每页数量：1
    url.searchParams.set('showbiz', 'false') // 不显示商业边界

    const res = await fetch(url.toString()) // 发起网络请求
    const json = (await res.json()) as AmapDistrictResponse // 将响应解析为 JSON 格式

    if (json.status !== '1') { // 判断 API 状态是否成功
        throw new Error(`AMap API error: ${json.info} (${json.infocode})`) // 抛出 API 错误异常
    }

    const root = json.districts?.[0] // 获取返回的第一个行政区
    if (!root) throw new Error('AMap API error: empty districts') // 如果结果为空，抛出错误
    return root // 返回中国行政数据对象
}

function MapHome() { // 主地图组件定义
    const key = (import.meta.env.VITE_AMAP_KEY as string | undefined) ?? '' // 从环境变量获取高德 API Key

    const mapRef = useRef<maplibregl.Map | null>(null) // 创建地图实例的引用
    const containerRef = useRef<HTMLDivElement | null>(null) // 创建地图容器 DOM 的引用
    const errorBoxRef = useRef<HTMLDivElement | null>(null) // 创建错误提示框 DOM 的引用

    const emptyFC: AdminFC = useMemo(() => ({type: 'FeatureCollection', features: []}), []) // 记忆化一个空的 GeoJSON 对象

    useEffect(() => { // 处理 Body 样式的副作用钩子
        document.body.classList.add('map-mode') // 组件挂载时添加地图模式 class
        return () => document.body.classList.remove('map-mode') // 组件卸载时移除 class
    }, []) // 仅在挂载和卸载时运行

    useEffect(() => { // 初始化地图实例的副作用钩子
        if (!containerRef.current) return // 如果容器还没渲染好，直接返回
        if (mapRef.current) return // 如果地图已经创建过了，不再重复创建

        const map = new maplibregl.Map({ // 实例化 MapLibre 地图对象
            container: containerRef.current, // 指定地图容器
            style: { // 自定义地图样式（底图）
                version: 8, // Mapbox 样式规范版本
                sources: {}, // 初始数据源为空
                layers: [ // 初始图层配置
                    {id: 'bg', type: 'background', paint: {'background-color': '#F6F7FB'}}, // 配置浅蓝色背景图层
                ],
            },
            //  初始中心点（可选，如果不生效可以用 bounds）
            center: [104.2, 37.5], // 中国地理中心坐标

            // 关键点 1：maxBounds 留出余地
            maxBounds: MAX_BOUNDS,

            // 关键点 2：初始视野使用核心范围
            bounds: CORE_CHINA_BOUNDS,
            fitBoundsOptions: {
                padding: 20, // 视觉上的留白
                essential: true
            },

            // 关键点 3：设置合理的最小缩放，防止滚轮无法缩小
            // 3.5 左右通常刚好能看全中国，设置 3.0 可以让用户缩小时更有“弹性”感
            minZoom: 3,
            maxZoom: 14,

            // 关键点 4：交互设置
            scrollZoom: true,
            dragPan: true,
        })

        map.addControl(new maplibregl.NavigationControl({visualizePitch: true}), 'top-right') // 在右上角添加导航控件

        map.on('load', async () => { // 监听地图加载完成事件

            // 强制回到核心区域，确保开屏看到完整中国
    map.fitBounds(CORE_CHINA_BOUNDS, {
      padding: 30,
      animate: false
    });

            containerRef.current?.focus();
            map.resize() // 触发地图尺寸自适应
            requestAnimationFrame(() => map.resize()) // 在下一帧再次强制刷新尺寸
            setTimeout(() => map.resize(), 50) // 50毫秒后最后一次兜底刷新

            // source
            map.addSource('cn-outline', {type: 'geojson', data: emptyFC}) // 向地图添加一个名为 cn-outline 的 GeoJSON 数据源

            // layers（图层绘制）
            map.addLayer({ // 添加填充图层
                id: 'cn-outline-fill', // 图层唯一 ID
                type: 'fill', // 图层类型：填充
                source: 'cn-outline', // 使用的数据源
                paint: {
                    'fill-color': '#fff',
                    'fill-opacity': 0.8 // 提高不透明度，让中国版图在背景中脱颖而出
                }
            })
            map.addLayer({ // 添加线图层
                id: 'cn-outline-line', // 图层唯一 ID
                type: 'line', // 图层类型：线条
                source: 'cn-outline', // 使用的数据源
                paint: {'line-color': '#94A3B8', 'line-width': 2.2, 'line-opacity': 0.9}, // 灰色线条，宽度 2.2
            })

            // 加载轮廓数据
            try {
                if (!key) throw new Error('Missing VITE_AMAP_KEY') // 检查 Key 是否配置

                if (errorBoxRef.current) { // 显示加载状态
                    errorBoxRef.current.style.display = 'block' // 设置提示框显示
                    errorBoxRef.current.textContent = '正在加载中国轮廓…' // 修改提示文字
                }

                const root = await fetchChinaOutline(key) // 调用异步函数获取高德数据
                if (!root.polyline) throw new Error('中国轮廓 polyline 为空（AMap 未返回）') // 验证边界数据是否存在

                const geom = polylineToGeometry(root.polyline) // 将 polyline 解析为标准几何体
                if (!geom) throw new Error('中国轮廓 polyline 解析失败') // 验证解析结果

                const feature: AdminFeature = { // 构造 GeoJSON 要素
                    type: 'Feature', // 类型为要素
                    properties: {name: root.name || '中国', adcode: root.adcode || '100000', level: 'country'}, // 注入属性
                    geometry: geom, // 注入几何数据
                }

                const src = map.getSource('cn-outline') as GeoJSONSource // 获取地图中的数据源对象
                src.setData({type: 'FeatureCollection', features: [feature]}) // 更新数据源，地图会自动重绘

                if (errorBoxRef.current) { // 显示加载完成
                    errorBoxRef.current.style.display = 'block' // 设置提示框显示
                    errorBoxRef.current.textContent = '中国轮廓已绘制 ✅' // 修改成功文字
                }
            } catch (e) { // 捕获异常
                const msg = e instanceof Error ? e.message : String(e) // 格式化错误信息
                if (errorBoxRef.current) { // 显示失败信息
                    errorBoxRef.current.style.display = 'block' // 设置提示框显示
                    errorBoxRef.current.textContent = `加载失败：${msg}` // 修改失败文字
                }
            }
        })

        const handleResize = () => map.resize() // 定义窗口缩放时的处理函数
        window.addEventListener('resize', handleResize) // 监听浏览器窗口大小变化
        window.addEventListener('orientationchange', handleResize) // 监听移动端屏幕旋转

        mapRef.current = map // 将地图实例存储到引用中供外部使用

        return () => { // 清理函数
            window.removeEventListener('resize', handleResize) // 移除窗口缩放监听
            window.removeEventListener('orientationchange', handleResize) // 移除旋转监听
            map.remove() // 销毁地图实例
            mapRef.current = null // 清空地图引用
        }
    }, [emptyFC, key]) // 当空数据源或 Key 变化时重新运行

    return ( // 组件渲染内容
        <div className="map-page"> {/* 地图页面根容器 */}
            <div ref={containerRef} className="map-container"/>
            {/* 承载 MapLibre 的 DOM 节点 */}

        </div>
    )
}

export default MapHome // 导出组件