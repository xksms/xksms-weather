import './App.css'
import {BrowserRouter, Route, Routes} from "react-router-dom";
import Planning from "./pages/Planning.tsx";
// 定义地图首页占位组件


function MapHome() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>这是地图首页（开发中）</h1>
      <p>访问 <a href="/plan">/plan</a> 可以看到原来的规划页面</p>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 访问 http://localhost:5173/ 时显示地图 */}
        <Route path="/" element={<MapHome />} />

        {/* 访问 http://localhost:5173/plan 时显示开发规划 */}
        <Route path="/plan" element={<Planning />} />
      </Routes>
    </BrowserRouter>
  )
}
export default App
