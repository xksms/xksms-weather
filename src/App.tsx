import './App.css'
import {BrowserRouter, Route, Routes} from "react-router-dom";
import Planning from "./pages/Planning.tsx";
import MapHome from "./pages/MapHome.tsx";
// 定义地图首页占位组件


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
