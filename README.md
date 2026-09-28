# Skyline Ace

一款可直接部署到 GitHub Pages 的飛行閃避遊戲。駕駛民航客機穿越城市，閃避獨立出現的雷雲、不同高度的建築物，以及迎面而來的敵機與 UFO。

## 操作方式

- `Space`、`W`、`↑` 或點擊／觸碰畫面：拉升飛機
- `P` 或 `Esc`：暫停／繼續
- `M`：開啟／關閉音效

遊戲會自動保存瀏覽器中的最高分。隨著分數增加，飛行速度會變快，障礙也會更頻繁。

## 本機執行

這是純 HTML、CSS 與 JavaScript 專案，不需要安裝任何套件。可直接開啟 `index.html`，或在專案資料夾啟動任意靜態伺服器：

```bash
python -m http.server 8000
```

接著前往 `http://localhost:8000`。

## 部署到 GitHub Pages

專案已包含 `.github/workflows/pages.yml`，推送到 GitHub 的 `main` 分支後：

1. 開啟 repository 的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
3. 回到 **Actions** 等候 `Deploy static game to GitHub Pages` 完成。
4. 完成後，Pages 畫面會顯示可遊玩的網址。

所有資源皆使用相對路徑，因此 repository 名稱可自由設定。
