import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../css/map.css'


type PrecipKind = 'rain' | 'snow'

type PrecipProperties = {
  kind: PrecipKind
  city: string
  intensity: number
  updatedAt?: string
}

type PrecipFeature = GeoJSON.Feature<GeoJSON.Point, PrecipProperties>
type PrecipCollection = GeoJSON.FeatureCollection<GeoJSON.Point, PrecipProperties>

type ClusterProperties = {
  cluster: true
  cluster_id: number
  point_count: number
  point_count_abbreviated: string
} & GeoJSON.GeoJsonProperties

function isPointGeometry(
  g: GeoJSON.Geometry | GeoJSON.GeometryCollection | null | undefined
): g is GeoJSON.Point {
  return !!g && g.type === 'Point'
}

function toLngLat(coords: GeoJSON.Position): [number, number] {
  return [coords[0] as number, coords[1] as number]
}

function MapHome() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) return // 防止 React 严格模式下重复初始化

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json', // 临时：公开示例底图（OSM）
      center: [104.0, 35.0], // 中国大致中心
      zoom: 3.4,
      minZoom: 2.5,
      maxZoom: 14,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('load', () => {
      const geojson: PrecipCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'snow', city: '哈尔滨', intensity: 2 },
            geometry: { type: 'Point', coordinates: [126.6424, 45.756] },
          },
          {
            type: 'Feature',
            properties: { kind: 'rain', city: '上海', intensity: 3 },
            geometry: { type: 'Point', coordinates: [121.4737, 31.2304] },
          },
          {
            type: 'Feature',
            properties: { kind: 'rain', city: '广州', intensity: 1 },
            geometry: { type: 'Point', coordinates: [113.2644, 23.1291] },
          },
          {
            type: 'Feature',
            properties: { kind: 'snow', city: '乌鲁木齐', intensity: 1 },
            geometry: { type: 'Point', coordinates: [87.6168, 43.8256] },
          },
        ],
      }

      map.addSource('precip', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 7,
      })

      // 聚合气泡（圆）
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'precip',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16, // <= 10
            10,
            20, // <= 30
            30,
            26, // > 30
          ],
          'circle-opacity': 0.85,
          'circle-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#AAB7C4',
        },
      })

      // 聚合数量文字
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'precip',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
        },
        paint: {
          'text-color': '#334155',
        },
      })

      // 非聚合点位（占位：后续替换成可爱 SVG 图标）
      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'precip',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 8,
          'circle-opacity': 0.95,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'snow',
            '#B9E1FF',
            'rain',
            '#7DB9E8',
            '#94A3B8',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      })

      // 点击聚合：放大展开
      map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        const f = features[0]
        if (!f) return

        const props = f.properties as unknown as ClusterProperties
        const clusterId = props.cluster_id
        if (typeof clusterId !== 'number') return

        if (!isPointGeometry(f.geometry)) return
        const center = toLngLat(f.geometry.coordinates)

        const src = map.getSource('precip')
        if (!src || src.type !== 'geojson') return

        // MapLibre 的 TS 声明对集群方法有时不完整：用“最小接口”声明避免 any
        const clusterApi = src as unknown as {
          getClusterExpansionZoom: (
            id: number,
            cb: (error: Error | null, zoom: number) => void
          ) => void
        }

        clusterApi.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return
          map.easeTo({ center, zoom })
        })
      })

      // 点击单点：弹出临时 popup（后面换成你的城市卡片 UI）
      map.on('click', 'unclustered', (e) => {
        const f = e.features?.[0] as unknown as PrecipFeature | undefined
        if (!f) return
        if (!isPointGeometry(f.geometry)) return

        const { city, kind, intensity } = f.properties
        const [lng, lat] = toLngLat(f.geometry.coordinates)

        new maplibregl.Popup({ offset: 12 })
          .setLngLat([lng, lat])
          .setHTML(
            `<div style="font-size:12px;line-height:1.4">
              <div style="font-weight:600">${city}</div>
              <div>${kind === 'snow' ? '正在下雪' : '正在下雨'} · 强度 ${intensity}</div>
              <div style="opacity:.7">更新时间：刚刚</div>
            </div>`
          )
          .addTo(map)
      })

      // 交互反馈：鼠标变手（移动端无影响）
      map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', 'unclustered', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'unclustered', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    mapRef.current = map

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return (
    <div className="map-page">
      <div ref={containerRef} className="map-container" />
      {/* 这里后续放：搜索框、模式切换、分享按钮等 */}
    </div>
  )
}

export default MapHome