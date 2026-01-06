import {useEffect, useMemo, useRef} from 'react'
import maplibregl, {type GeoJSONSource, type LngLatBoundsLike} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../App.css'
import '../css/Map.css'

/** --- 1. 类型定义 --- **/
type DistrictLevel = 'country' | 'province' | 'city' | 'district'


// 定义从 JSON 文件里读出来的原始 Feature 格式
interface RawFeature {
    properties: {
        name: string;
        adcode: string | number;
    };
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

type AdminProps = { name: string; adcode: string; level: DistrictLevel; id: number }

// 定义严格的 Feature 接口，解决 TS 报错
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
    [73.4, 3.5],
    [135.1, 53.6],
]

const MAX_BOUNDS: LngLatBoundsLike = [
    [CORE_CHINA_BOUNDS[0][0] - 10, CORE_CHINA_BOUNDS[0][1] - 10],
    [CORE_CHINA_BOUNDS[1][0] + 10, CORE_CHINA_BOUNDS[1][1] + 10],
]


/** --- 4. 主组件 --- **/
function MapHome() {
    const key = (import.meta.env.VITE_AMAP_KEY as string | undefined) ?? ''
    const mapRef = useRef<maplibregl.Map | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const errorBoxRef = useRef<HTMLDivElement | null>(null)
    const popupRef = useRef<maplibregl.Popup | null>(null)

    const emptyFC: AdminFC = useMemo(() => ({type: 'FeatureCollection', features: []}), [])

    // 气泡内容
    const getMockWeather = (name: string) => {
        const weathers = ['☀️ 晴', '☁️ 多云', '🌧️ 小雨', '🌦️ 阵雨']
        return `<div style="padding:5px;font-size:13px"><strong>${name}</strong><br/>${weathers[Math.floor(Math.random() * weathers.length)]}</div>`
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
                maxZoom: 12,
            })

            map.addControl(new maplibregl.NavigationControl(), 'top-right')

            map.on('load', async () => {
                map.fitBounds(CORE_CHINA_BOUNDS, {padding: 40, animate: false})

                // 添加两个数据源：一个是中国大框，一个是各省列表
                map.addSource('china-outline', {type: 'geojson', data: emptyFC})
                map.addSource('provinces', {type: 'geojson', data: emptyFC, generateId: true})

                // 图层 1：中国白底背景（为了把海洋和陆地分开）
                map.addLayer({
                    id: 'china-fill',
                    type: 'fill',
                    source: 'china-outline',
                    paint: {'fill-color': '#FFFFFF', 'fill-opacity': 0.9}
                })

                // 图层 2：省份高亮层（鼠标移上去时变色）
                map.addLayer({
                    id: 'province-fill',
                    type: 'fill',
                    source: 'provinces',
                    paint: {
                        'fill-color': '#6366f1', // 靛蓝色
                        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.2, 0.0]
                    }
                })

                // 图层 3：中国粗外边框
                map.addLayer({
                    id: 'china-line',
                    type: 'line',
                    source: 'china-outline',
                    paint: {'line-color': '#475569', 'line-width': 2}
                })

                // 图层 4：省份虚线边框
                map.addLayer({
                    id: 'province-line',
                    type: 'line',
                    source: 'provinces',
                    paint: {'line-color': '#94A3B8', 'line-width': 0.8, 'line-dasharray': [2, 1]}
                })

                const popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 15})
                popupRef.current = popup

                try {
                    // 1. 获取中国轮廓 (现在从本地读取，不再调用高德，省钱！)
                    const countryRes = await fetch('/data/china.json'); // 路径对应 public/data/china.json
                    const countryData = await countryRes.json();
                    (map.getSource('china-outline') as GeoJSONSource).setData(countryData);

                    // 2. 获取省份边界 (从本地读取)
                    const provinceRes = await fetch('/data/provinces.json'); // 路径对应 public/data/provinces.json
                    const provinceData = await provinceRes.json();

                    // 给数据加工 ID (为了悬停变色)
                    const provinceFeatures: AdminFeature[] = provinceData.features.map((f: RawFeature, idx: number): AdminFeature => {
                        return {
                            type: 'Feature' as const,
                            id: idx,
                            properties: {
                                name: f.properties.name,
                                adcode: String(f.properties.adcode), // 确保转成字符串
                                level: 'province' as DistrictLevel,
                                id: idx
                            },
                            geometry: f.geometry
                        };
                    });


                    // 3. 更新地图数据源
                    const pSource = map.getSource('provinces') as GeoJSONSource;
                    pSource.setData({
                        type: 'FeatureCollection' as const,
                        features: provinceFeatures
                    });

                    console.log('边界数据加载成功（本地资源）');
                } catch (e: unknown) {
                    console.error('加载本地数据失败，请检查 public/data/ 目录下是否存在 json 文件', e);
                }


                /** --- 交互逻辑 --- **/
                let hoveredId: number | null = null

                map.on('mousemove', 'province-fill', (e) => {
                    if (e.features && e.features.length > 0) {
                        map.getCanvas().style.cursor = 'pointer'
                        const feature = e.features[0]
                        const currentId = feature.id as number

                        if (hoveredId !== null && hoveredId !== currentId) {
                            map.setFeatureState({source: 'provinces', id: hoveredId}, {hover: false})
                        }

                        hoveredId = currentId
                        map.setFeatureState({source: 'provinces', id: hoveredId}, {hover: true})

                        popup.setLngLat(e.lngLat).setHTML(getMockWeather(feature.properties.name)).addTo(map)
                    }
                })

                map.on('mouseleave', 'province-fill', () => {
                    map.getCanvas().style.cursor = ''
                    popup.remove()
                    if (hoveredId !== null) {
                        map.setFeatureState({source: 'provinces', id: hoveredId}, {hover: false})
                        hoveredId = null
                    }
                })
            })

            const handleResize = () => map.resize()
            window.addEventListener('resize', handleResize)
            mapRef.current = map

            return () => {
                window.removeEventListener('resize', handleResize)
                map.remove()
                mapRef.current = null
            }
        }

        ,
        [emptyFC, key]
    )

    return (
        <div className="map-page" style={{width: '100vw', height: '100vh', position: 'relative'}}>
            <div ref={containerRef} style={{width: '100%', height: '100%'}}/>
            {/* 底部提示框 */}
            <div ref={errorBoxRef} style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                background: 'white',
                padding: '8px 12px',
                borderRadius: '8px',
                display: 'none',
                fontSize: '12px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}/>
        </div>
    )
}

export default MapHome