import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../App.css'
import '../css/Map.css'

/** --- 1. 类型定义 --- **/
type DistrictLevel = 'country' | 'province' | 'city' | 'district'

type AmapDistrict = {
  name: string
  adcode: string
  level: DistrictLevel
  polyline?: string
}

type AmapDistrictResponse = {
  status: '0' | '1'
  info: string
  infocode: string
  districts: AmapDistrict[]
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

/** --- 3. 工具函数 --- **/

// 将高德 Polyline 字符串转为几何对象（用于中国外轮廓）
function polylineToGeometry(polyline: string): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!polyline) return null
  const parts = polyline.split('|').map((s) => s.trim()).filter(Boolean)
  const polygons: number[][][] = []
  for (const seg of parts) {
    const ring = seg.split(';').map((pt) => pt.trim()).filter(Boolean).map((pt) => {
      const [lng, lat] = pt.split(',').map(Number)
      return (Number.isFinite(lng) && Number.isFinite(lat)) ? [lng, lat] : null
    }).filter((v): v is [number, number] => v !== null)
    if (ring.length < 3) continue
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0])
    polygons.push(ring)
  }
  if (polygons.length === 0) return null
  if (polygons.length === 1) return { type: 'Polygon', coordinates: [polygons[0]] }
  return { type: 'MultiPolygon', coordinates: polygons.map((r) => [r]) }
}

// 获取中国轮廓（仅用作底图背景）
async function fetchChinaOutline(key: string): Promise<AmapDistrict> {
  const url = new URL('/amap/v3/config/district', window.location.origin)
  url.searchParams.set('key', key)
  url.searchParams.set('keywords', '中国')
  url.searchParams.set('subdistrict', '0')
  url.searchParams.set('extensions', 'all')
  const res = await fetch(url.toString())
  const json = (await res.json()) as AmapDistrictResponse
  if (json.status !== '1') throw new Error(json.info)
  return json.districts[0]
}

/** --- 4. 主组件 --- **/
function MapHome() {
  const key = (import.meta.env.VITE_AMAP_KEY as string | undefined) ?? ''
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const errorBoxRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)

  const emptyFC: AdminFC = useMemo(() => ({ type: 'FeatureCollection', features: [] }), [])

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
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#F1F5F9' } }],
      },
      bounds: CORE_CHINA_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      maxBounds: MAX_BOUNDS,
      minZoom: 2.8,
      maxZoom: 12,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('load', async () => {
      map.fitBounds(CORE_CHINA_BOUNDS, { padding: 40, animate: false })

      // 添加两个数据源：一个是中国大框，一个是各省列表
      map.addSource('china-outline', { type: 'geojson', data: emptyFC })
      map.addSource('provinces', { type: 'geojson', data: emptyFC, generateId: true })

      // 图层 1：中国白底背景（为了把海洋和陆地分开）
      map.addLayer({
        id: 'china-fill',
        type: 'fill',
        source: 'china-outline',
        paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.9 }
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
        paint: { 'line-color': '#475569', 'line-width': 2 }
      })

      // 图层 4：省份虚线边框
      map.addLayer({
        id: 'province-line',
        type: 'line',
        source: 'provinces',
        paint: { 'line-color': '#94A3B8', 'line-width': 0.8, 'line-dasharray': [2, 1] }
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 15 })
      popupRef.current = popup

      try {
        if (!key) throw new Error('API Key Missing')

        // 1. 加载中国外轮廓（来自高德）
        const country = await fetchChinaOutline(key)
        if (country.polyline) {
          const geom = polylineToGeometry(country.polyline)
          if (geom) {
            (map.getSource('china-outline') as GeoJSONSource).setData({
              type: 'Feature', geometry: geom, properties: {}
            } as any)
          }
        }

        // 2. 加载全国省份详细边界（来自阿里云 DataV，这才是解决问题的核心）
        // 这个接口一次性返回全国 34 个省份的边界坐标
        const provinceRes = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
        const provinceData = await provinceRes.json()

        const provinceFeatures: AdminFeature[] = provinceData.features.map((f: any, idx: number) => ({
          type: 'Feature' as const,
          id: idx,
          properties: {
            name: f.properties.name,
            adcode: f.properties.adcode,
            level: 'province' as DistrictLevel,
            id: idx
          },
          geometry: f.geometry
        }))

        // 把省份数据塞进地图
        const pSource = map.getSource('provinces') as GeoJSONSource
        pSource.setData({ type: 'FeatureCollection', features: provinceFeatures })

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (errorBoxRef.current) {
          errorBoxRef.current.style.display = 'block'
          errorBoxRef.current.textContent = `加载失败: ${msg}`
        }
      }

      /** --- 交互逻辑 --- **/
      let hoveredId: number | null = null

      map.on('mousemove', 'province-fill', (e) => {
        if (e.features && e.features.length > 0) {
          map.getCanvas().style.cursor = 'pointer'
          const feature = e.features[0]
          const currentId = feature.id as number

          if (hoveredId !== null && hoveredId !== currentId) {
            map.setFeatureState({ source: 'provinces', id: hoveredId }, { hover: false })
          }

          hoveredId = currentId
          map.setFeatureState({ source: 'provinces', id: hoveredId }, { hover: true })

          popup.setLngLat(e.lngLat).setHTML(getMockWeather(feature.properties.name)).addTo(map)
        }
      })

      map.on('mouseleave', 'province-fill', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'provinces', id: hoveredId }, { hover: false })
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
  }, [emptyFC, key])

  return (
    <div className="map-page" style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* 底部提示框 */}
      <div ref={errorBoxRef} style={{ position: 'absolute', bottom: 20, left: 20, background: 'white', padding: '8px 12px', borderRadius: '8px', display: 'none', fontSize: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }} />
    </div>
  )
}

export default MapHome