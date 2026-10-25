# Golden Rain 页面（独立目录）

将 `public/gold-particles/` 文件夹复制到仓库根目录现有的 `public/` 里。

## 文件结构

```text
public/
└── gold-particles/
    ├── index.html
    └── gold-particles.css
```

这个页面与现有 `src/`、主页面和地图代码隔离。它是 Vite 的静态 public 页面，不需要改 `src/main.ts` 或 `src/style.css`，也没有图片或第三方依赖。

## 本地预览

在项目根目录运行 `pnpm dev`，然后打开开发服务器地址下的：

`/gold-particles/`

## GitHub Pages

仓库使用 `/temp/` 子路径时，部署地址通常为：

`https://aaabby-w.github.io/temp/gold-particles/`

页面内的“返回主页面”链接使用相对路径，能回到站点根目录。
