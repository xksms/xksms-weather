import '../App.css'

const principles = [
  '视觉优先于信息：图标先行，文字辅助',
  '克制：功能少但每个都有存在意义',
  '手机端优先：拇指操作、单手可用',
  '截图即内容：截图后无需解释',
]

const confirmedFeatures = [
  '中国地图上只展示下雨 / 下雪',
  '可爱天气图标，含强度与昼夜模式',
  '地图缩放聚合：城市 → 站点',
  '点击城市弹出天气卡片',
  '搜索城市并飞到位置',
  '生成分享卡片，便于社交传播',
]

const funModes = [
  {
    title: '今天中国哪里在下雪？',
    note: '冷色背景，只显示下雪城市；上线首屏默认模式',
  },
  {
    title: '现在，雨最猛的地方',
    note: '只展示一个极值城市，图标强烈但不吵闹',
  },
]

const shareCard = {
  title: '降水打卡 / 分享卡片',
  items: [
    '城市名 + 超大可爱图标',
    '文案：我这里正在下雨 / 下雪',
    '时间戳，像一张天气明信片',
  ],
  goal: '用户一键生成，可直接发朋友圈 / 小红书，无需解释',
}

const timeline = [
  { day: 'Day 0', focus: '默认进入「今天中国哪里在下雪？」，首屏即可截图' },
  { day: 'Day 1-2', focus: '用户直接截图地图分享' },
  { day: 'Day 3-4', focus: '推出「生成我的天气卡片」' },
  { day: 'Day 5-6', focus: '展示「雨最猛的地方」' },
  { day: 'Day 7', focus: '期待用户自发传播，判断是否有人问：这个图是哪来的？' },
]

function App() {
  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">手机端优先 · 可爱天气地图</p>
        <h1>一眼看到中国哪里在下雨 / 下雪</h1>
        <p className="lede">
          专注“看天气”而非“查天气”，通过可爱视觉和地图交互，让人忍不住截图与分享。
        </p>
        <div className="chips">
          {['实时雨/雪', '地图聚合', '可爱图标', '截图即内容'].map((item) => (
            <span className="chip" key={item}>
              {item}
            </span>
          ))}
        </div>
      </header>

      <section className="card">
        <div className="section-title">
          <h2>核心设计原则</h2>
          <p>克制、直观、为截图而生</p>
        </div>
        <ul className="list">
          {principles.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="section-title">
          <h2>核心功能范围（已确定）</h2>
          <p>少而精，每个功能都有截图价值</p>
        </div>
        <ul className="list two-column">
          {confirmedFeatures.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section className="grid">
        {funModes.map((mode) => (
          <div className="card highlight" key={mode.title}>
            <div className="section-title">
              <h3>{mode.title}</h3>
              <p>趣味模式</p>
            </div>
            <p className="body">{mode.note}</p>
          </div>
        ))}
        <div className="card highlight share">
          <div className="section-title">
            <h3>{shareCard.title}</h3>
            <p>传播资产</p>
          </div>
          <ul className="list">
            {shareCard.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="body emphasize">{shareCard.goal}</p>
        </div>
      </section>

      <section className="card timeline">
        <div className="section-title">
          <h2>7 天可传播版本规划</h2>
          <p>上线首周的节奏设计</p>
        </div>
        <div className="timeline-items">
          {timeline.map((slot) => (
            <div className="timeline-item" key={slot.day}>
              <span className="pill">{slot.day}</span>
              <p>{slot.focus}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
