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

卡片圖示放在 `img/sites/<slug>.png`（約 192×192）。請優先使用該網站自己的 favicon、apple-touch-icon 或 manifest 圖示；沒有合適圖示時，用該分類色調的字首圖磚。任何內容都不要使用十字架的 emoji 或圖示（含 Chi-Rho）。

標題請盡量不超過 14 個字。


## 本機預覽

```bash
python3 -m http.server 18765 --bind 127.0.0.1
```

然後開啟 http://127.0.0.1:18765/

## 注意

此分支尚未合併到 `main`，須經確認後才會成為對外首頁。
