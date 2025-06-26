// vite.config.js
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  // 基本配置通常是空的，因为默认值已经能很好地工作
  // 如果需要，可以在这里添加插件或自定义选项

  // 项目根目录，默认为 process.cwd()
  root: '.',

  // 公共基础路径，用于部署到子目录时
  // 例如，如果你的网站部署在 https://example.com/myapp/
  // 则设置为 '/myapp/'
  base: './', // 使用相对路径，确保在各种环境下（如file://协议）都能工作

  // 构建选项
  build: {
    // 构建输出目录
    outDir: 'dist',

    // 小于此阈值的资源将内联为 base64，避免额外的 http 请求
    // 默认 4096 (4kb)
    assetsInlineLimit: 4096,

    // 是否生成 source map 文件
    sourcemap: false, // 生产环境建议关闭以减小文件大小
  },

  // 开发服务器选项
  server: {
    // 自动在浏览器中打开应用
    open: true,

    // 配置服务器主机名和端口
    host: 'localhost',
    port: 5173,
  },
});