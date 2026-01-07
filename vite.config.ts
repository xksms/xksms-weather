import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/amap': {
        target: 'https://restapi.amap.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/amap/, ''),
      },
      // 新增：指向你的 Java 后端代理
      '/api': {
        target: 'http://localhost:8758', // 这里填写你 Java 后端的实际运行地址和端口
        changeOrigin: true,
        // 如果你的后端接口路径本身就带 /api，则不需要 rewrite
        // 如果后端接口不带 /api（例如请求 /api/geo 实际上想访问后端的 /geo），则取消下面一行的注释：
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
