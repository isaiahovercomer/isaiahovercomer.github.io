# 簡晨光 Isaiah 的網頁總覽

GitHub 使用者網站的首頁，用來分類整理目前公開的網頁與工具。

線上預覽（合併後）：https://isaiahovercomer.github.io/

## 現有內容如何處理

改版前，這個倉只有：

- `index.html`：台中市召會特會行動報名系統入口（連到 `forms-app-web`）
- `googledf203d55a348fa29.html`：Google Search Console 驗證檔（已保留在根目錄）
- `.nojekyll`

原首頁完整保留在 [`signup/index.html`](signup/index.html)，合併後網址為 `/signup/`。頁尾仍提供報名系統的隱私權政策、服務條款，以及聯絡信箱。

## 如何新增或修改連結

編輯根目錄的 [`links.json`](links.json) 即可，不必改程式。

- `categories`：分類與卡片（標題、一行說明、網址、圖示）
- `social`：頁首社群列
- `footer`：頁尾連結

卡片圖示放在 `img/sites/<slug>.png`（約 192×192）。請優先使用該網站自己的 favicon、apple-touch-icon 或 manifest 圖示；沒有合適圖示時，用該分類色調的字首圖磚。不要使用獨立的十字架 emoji 或圖示；原文聖經的 IN CHRIST 圓印（含 Chi-Rho）可以使用。

標題請盡量不超過 14 個字。


## 子頁 `line/`

「召會生活實行常用LINE功能整理」：三個 LINE 建立平台（活動登記、網頁圖卡、流通愛圖卡）的大卡片入口，可加到手機主畫面（PWA：`line/manifest.webmanifest`、`line/sw.js` 只快取本頁靜態檔）。各平台圖示複製自各自的 repo（`line/img/`）；整合圖示原檔為 `line/img/app-icon.svg`，PNG 以 Chromium 轉出。

## 子頁 `toolbox/`

「台中全時間百寶箱」：同樣三個 LINE 建立平台的大卡片（內建，永遠顯示），加上「新增連結」投稿區；投稿經管理者審核後才會出現在頁面上。可加到手機主畫面（PWA：`toolbox/manifest.webmanifest`、`toolbox/sw.js`，只快取本頁靜態檔，不快取 LIFF 與後端 API）。

- 後端網址設定在 `toolbox/config.js` 的 `API_URL`（Apps Script 網頁應用程式 `/exec`，不是金鑰）。留空時頁面照常顯示三個工具，「新增連結」顯示暫未開放。
- 後端原始碼與部署、審核說明：[`backend/toolbox-script/README.md`](backend/toolbox-script/README.md)。密碼、Sheet ID 只存在 Apps Script 的指令碼屬性，不在 repo。
- 圖示原檔 `toolbox/img/app-icon.svg`；PNG（含首頁卡片圖示 `img/sites/toolbox.png`）用 `node scripts/render-toolbox-icons.js` 以 Chromium 轉出。

## 測試

先另開一個本機伺服器，再跑 Playwright（最多 2 workers）：

```bash
python3 -m http.server 18821 --bind 127.0.0.1 &
HUB_PORT=18821 npm test
```

## 本機預覽

```bash
python3 -m http.server 18765 --bind 127.0.0.1
```

然後開啟 http://127.0.0.1:18765/

## 注意

此分支尚未合併到 `main`，須經確認後才會成為對外首頁。
