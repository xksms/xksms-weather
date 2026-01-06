import {useEffect, useMemo, useRef} from 'react'
import maplibregl, {type GeoJSONSource, type LngLatBoundsLike} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../App.css'
import '../css/Map.css'

/** --- 1. 类型定义（严格模式） --- **/
type DistrictLevel = 'country' | 'province' | 'city' | 'district'

// 定义从本地或接口读取的原始数据契约
interface RawFeature {
    properties: {
        name: string;
        adcode: string | number;
    };
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

// 定义注入地图后的属性契约
type AdminProps = {
    name: string;
    adcode: string;
    level: DistrictLevel;
    id: number
}

// 严格定义 Feature，强制 id 为数字，解决变色报错
interface AdminFeature {
    type: "Feature";
    id: number;
    properties: AdminProps;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

type AdminFC = {
    type: "FeatureCollection";
    features: AdminFeature[];
}

/** --- 2. 坐标与边界常量 --- **/
const CORE_CHINA_BOUNDS: [[number, number], [number, number]] = [
    [73.4, 3.5],   // 西南
    [135.1, 53.6], // 东北
]

const MAX_BOUNDS: LngLatBoundsLike = [
    [CORE_CHINA_BOUNDS[0][0] - 10, CORE_CHINA_BOUNDS[0][1] - 10],
    [CORE_CHINA_BOUNDS[1][0] + 10, CORE_CHINA_BOUNDS[1][1] + 10],
]

/** --- 3. 辅助工具函数 --- **/

// 计算几何体的包围盒（用于点击后的视角缩放飞行）
function getGeometryBounds(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): LngLatBoundsLike {
    let coords: number[][] = [];
    if (geometry.type === 'Polygon') {
        coords = geometry.coordinates[0];
    } else {
        geometry.coordinates.forEach(poly => {
            coords.push(...poly[0]);
        });
    }
    const lats = coords.map(c => c[1]);
    const lngs = coords.map(c => c[0]);
    return [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
    ];
}

/** --- 4. 主组件 --- **/
function MapHome() {
    const key = (import.meta.env.VITE_AMAP_KEY as string | undefined) ?? ''
    const mapRef = useRef<maplibregl.Map | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const popupRef = useRef<maplibregl.Popup | null>(null)

    // 缓存已加载的区县数据，防止重复请求
    const loadedDataCache = useRef<Set<string>>(new Set());

    // 记忆化初始空数据
    const emptyFC: AdminFC = useMemo(() => ({type: 'FeatureCollection' as const, features: []}), [])

    // 气泡内容模拟
    const getMockWeather = (name: string) => {
        const weathers = ['☀️ 晴', '☁️ 多云', '🌧️ 小雨', '🌦️ 阵雨']
        return `<div style="padding:5px;font-size:13px"><strong>${name}</strong><br/>${weathers[Math.floor(Math.random() * weathers.length)]}</div>`
    }

    /** --- 核心修正：使用专门的查询层获取 adcode --- **/
    async function updateDetailLevel(map: maplibregl.Map) {
        const zoom = map.getZoom();
        const center = map.getCenter();
        const point = map.project(center);

        // 【修改点】：只查询专用的隐形城市层，它没有 maxzoom 限制，任何级别都能查到 adcode
        const features = map.queryRenderedFeatures(point, {
            layers: ['city-query-layer']
        });

        if (!features || features.length === 0) return;
        const topFeature = features[0];
        const {adcode, name} = topFeature.properties as AdminProps;

        // 当缩放大于 8.5 级时，尝试加载该市的区县
        if (zoom > 8.5 && !loadedDataCache.current.has(`${adcode}_district`)) {
            try {
                const res = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`);
                const data = (await res.json()) as { features: RawFeature[] };

                const processed = {
                    type: 'FeatureCollection' as const,
                    features: data.features.map((f: RawFeature, i: number) => ({
                        ...f,
                        type: 'Feature' as const,
                        id: i
                    }))
                };

                const source = map.getSource('districts') as GeoJSONSource;
                if (source) {
                    // 补充逻辑：这里我们不再是“替换”全图，而是“更新”当前市的区县
                    source.setData(processed);
                    loadedDataCache.current.add(`${adcode}_district`);
                    console.log(`成功加载 ${name} (${adcode}) 的区县数据`);
                }
            } catch (e: unknown) {
                console.warn(`${name} 可能没有下级区县数据`, e instanceof Error ? e.message : '未知错误');
            }
        }
    }


    useEffect(() => {
        if (!containerRef.current || mapRef.current) return

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: {
                version: 8,
                sources: {},
                layers: [{id: 'bg', type: 'background', paint: {'background-color': '#F1F5F9'}}],
            },
            bounds: CORE_CHINA_BOUNDS,
            fitBoundsOptions: {padding: 20},
            maxBounds: MAX_BOUNDS,
            minZoom: 2.8,
            maxZoom: 16, // 支持深度缩放看区县
        })

        map.addControl(new maplibregl.NavigationControl(), 'top-right')

        map.on('load', async () => {
            map.fitBounds(CORE_CHINA_BOUNDS, {padding: 40, animate: false})

            // 1. 注册所有层级的数据源
            map.addSource('china-outline', {type: 'geojson', data: emptyFC})
            map.addSource('provinces', {type: 'geojson', data: emptyFC, generateId: true})
            map.addSource('cities', {type: 'geojson', data: emptyFC, generateId: true})
            map.addSource('districts', {type: 'geojson', data: emptyFC, generateId: true})

            // 2. 建立图层接力系统
            map.addLayer({id: 'china-fill', type: 'fill', source: 'china-outline', paint: {'fill-color': '#FFFFFF', 'fill-opacity': 0.9}})

            // 省级填充：Zoom 0-6 显示
            map.addLayer({
                id: 'province-fill', type: 'fill', source: 'provinces', maxzoom: 6,
                paint: {'fill-color': '#6366f1', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.2, 0.0]}
            })

            // 市级填充：Zoom 6-9 显示
            map.addLayer({
                id: 'city-fill', type: 'fill', source: 'cities', minzoom: 6, maxzoom: 11,
                paint: {'fill-color': '#6366f1', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.15, 0.0]}
            })

            // 区县填充：Zoom 9 以上显示
            map.addLayer({
                id: 'district-fill', type: 'fill', source: 'districts', minzoom: 9,
                paint: {'fill-color': '#10b981', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.15, 0.0]}
            })

            // 边界线绘制
            map.addLayer({id: 'china-line', type: 'line', source: 'china-outline', paint: {'line-color': '#475569', 'line-width': 2}})
            map.addLayer({id: 'province-line', type: 'line', source: 'provinces', maxzoom: 8, paint: {'line-color': '#94A3B8', 'line-width': 0.8, 'line-dasharray': [2, 1]}})


            // 1. 市级边界线（只有缩放级别在 6 到 9 之间才显示）
            map.addLayer({
                id: 'city-line',
                type: 'line',
                source: 'cities',
                minzoom: 6,
                maxzoom: 11,
                paint: {
                    'line-color': '#cbd5e1', // 浅灰色边框
                    'line-width': 0.6,       // 比省界稍微细一点
                    'line-opacity': 0.8
                }
            });

            // 【核心修正】：新增一个隐形查询层，专门用来拿 adcode
            map.addLayer({
                id: 'city-query-layer',
                type: 'fill',
                source: 'cities',
                paint: {'fill-opacity': 0} // 完全透明，不影响视觉
            })

            // 2. 区县级边界线（只有缩放级别 > 9 才显示）
            map.addLayer({
                id: 'district-line',
                type: 'line',
                source: 'districts',
                minzoom: 9,
                paint: {
                    'line-color': '#94a3b8', // 稍深一点的灰色
                    'line-width': 0.4,       // 最细的边框
                    'line-opacity': 0.6
                }
            });
            const popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 15})
            popupRef.current = popup

            // 3. 加载本地底图数据 (国家、省、市)
            try {
                // 加载国家
                const countryRes = await fetch('/data/china.json');
                const countryData = await countryRes.json();
                (map.getSource('china-outline') as GeoJSONSource).setData(countryData);

                // 加载省份
                const provinceRes = await fetch('/data/provinces.json');
                const provinceData = (await provinceRes.json()) as { features: RawFeature[] };
                const provinceFeatures: AdminFeature[] = provinceData.features.map((f: RawFeature, idx: number): AdminFeature => ({
                    type: 'Feature' as const,
                    id: idx,
                    properties: {name: f.properties.name, adcode: String(f.properties.adcode), level: 'province' as DistrictLevel, id: idx},
                    geometry: f.geometry
                }));
                (map.getSource('provinces') as GeoJSONSource).setData({type: 'FeatureCollection' as const, features: provinceFeatures});

                // 加载市级 (本地读取 city.json)
                const cityRes = await fetch('/data/city.json');
                const cityData = (await cityRes.json()) as { features: RawFeature[] };
                const cityFeatures: AdminFeature[] = cityData.features.map((f: RawFeature, idx: number): AdminFeature => ({
                    type: 'Feature' as const,
                    id: idx,
                    properties: {name: f.properties.name, adcode: String(f.properties.adcode), level: 'city' as DistrictLevel, id: idx},
                    geometry: f.geometry
                }));
                (map.getSource('cities') as GeoJSONSource).setData({type: 'FeatureCollection' as const, features: cityFeatures});

                console.log('国家、省、市级本地数据加载成功');
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : '未知错误';
                console.error('底图数据加载失败:', msg);
            }

            /** --- 4. 统一交互逻辑 --- **/
            const interactiveLayers = ['province-fill', 'city-fill', 'district-fill'];
            let hoveredId: number | null = null;
            let hoveredSource: string | null = null;

            // 悬停交互：变色 + 气泡
            map.on('mousemove', interactiveLayers, (e) => {
                if (e.features && e.features.length > 0) {
                    map.getCanvas().style.cursor = 'pointer';
                    const f = e.features[0];
                    const currentId = f.id as number;
                    const currentSource = f.source;

                    if (hoveredId !== null && hoveredSource !== null) {
                        map.setFeatureState({source: hoveredSource, id: hoveredId}, {hover: false});
                    }
                    hoveredId = currentId;
                    hoveredSource = currentSource;
                    map.setFeatureState({source: hoveredSource, id: hoveredId}, {hover: true});

                    popup.setLngLat(e.lngLat).setHTML(getMockWeather(f.properties.name)).addTo(map);
                }
            });

            // 移出交互
            map.on('mouseleave', interactiveLayers, () => {
                map.getCanvas().style.cursor = '';
                popup.remove();
                if (hoveredId !== null && hoveredSource !== null) {
                    map.setFeatureState({source: hoveredSource, id: hoveredId}, {hover: false});
                    hoveredId = null;
                    hoveredSource = null;
                }
            });

            // 点击飞行交互
            map.on('click', interactiveLayers, (e) => {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    const geometry = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
                    const bounds = getGeometryBounds(geometry);
                    map.fitBounds(bounds, {
                        padding: 80,
                        maxZoom: feature.source === 'province-fill' ? 8 : 12,
                        duration: 1500,
                        essential: true
                    });
                }
            });

            // 移动或飞行结束后，检查是否需要加载新区县
            map.on('moveend', () => {
                updateDetailLevel(map);
            });
        })

        const handleResize = () => map.resize()
        window.addEventListener('resize', handleResize)
        mapRef.current = map

        return () => {
            window.removeEventListener('resize', handleResize)
            map.remove()
            mapRef.current = null
        }
    }, [emptyFC, key])

    return (
        <div className="map-page" style={{width: '100vw', height: '100vh', position: 'relative'}}>
            <div ref={containerRef} style={{width: '100%', height: '100%'}}/>
        </div>
    )
}

export default MapHome