# 台中全時間服事百寶箱後端（Google Apps Script）

前端：`toolbox/`（https://isaiahovercomer.github.io/toolbox/）。這裡是後端原始碼，**不含任何密碼、金鑰或 Sheet ID**。
此資料夾不必部署到 GitHub Pages，只是方便交接；實際用 clasp 推送時，建議複製到 repo 外的 `/workspace/toolbox-script/`。

## 目前進度（2026-11-15）

已在 Isaiah 既有的 clasp 登入下完成：

- 建立新專案「台中全時間服事百寶箱後端」（沒有改到既有的四個專案）
- 編輯器：https://script.google.com/d/1zCO0xuEX7of-_WifKqUkNS4B09T1LHaxfDQuzPk2NjaDbQhM5Ys-f1Kj/edit
- 已 `clasp push` 上傳 `Code.gs`、`Admin.html`、`appsscript.json`
- 已用 clasp 建立一個版本部署（說明 v1）。但公開 `/exec` 目前仍回 Access Denied，而且 `setup()` 還沒在瀏覽器授權、也還沒設定 `ADMIN_PASSWORD`，所以前端的 `API_URL` 先留空，頁面顯示「新增連結暫未開放。」

請 Isaiah 從下面第 2 步做起（第 1 步已完成，不必再 `clasp create`）。

| 檔案 | 用途 |
| --- | --- |
| `Code.gs` | 投稿、已核准清單（JSON／JSONP）、審核 API、`setup()` |
| `Admin.html` | 審核頁（`/exec?page=admin`） |
| `appsscript.json` | 時區 Asia/Taipei；權限只有 spreadsheets、userinfo.email；以擁有者身分執行、任何人可存取 |

## 資料（Google Sheet，工作表 `links`）

`id, created_at, name, url, description, status(pending/approved/rejected), reviewed_at, reviewer, client_hash`

`client_hash` 是瀏覽器隨機 ID 的雜湊，只用來限制送出次數，不會出現在前端或審核頁。

## 安全設計

- 公開端只有兩件事：投稿（一律 `pending`）與讀取 `approved` 清單。沒有 `?approve=id` 這類網址。
- 審核頁所有動作（列出、核准、退回、刪除）都要 session token，沒有 token 一律失敗。token 只存在 CacheService（2 小時），以雜湊當鍵。
- 取得 token 的方式：
  1. 以 `ADMIN_EMAIL` 名單內的 Google 帳號開啟審核頁（擁有者本人開啟時通常可直接辨識）；或
  2. 輸入管理密碼，後端只和 Script Properties 的 `ADMIN_PASSWORD` 比對，不記錄、不回傳。連續錯 8 次鎖 15 分鐘。
- 後端再次驗證：名稱 1–80 字、網址只收 http/https 且 ≤ 500 字、說明 ≤ 300 字；含 `<script`、`javascript:` 等內容拒收；開頭是 `= + - @` 的值會加前綴，避免變成試算表公式。
- 防濫用：蜜罐欄位 `website` 有值 → 回成功但不寫入；同一瀏覽器每小時 5 次、全站每小時 60 次（Apps Script 拿不到訪客 IP，只能這樣做）。
- `setup()` 只有專案擁有者在編輯器裡執行才會動作。

## 部署步驟（Isaiah 需要親自做的部分）

以下需要在電腦瀏覽器登入 isaiah.overcomer@gmail.com。

1. **建立專案並推送程式**（已完成；下列指令僅供備查，不必再跑 `clasp create`）
   ```bash
   mkdir -p /workspace/toolbox-script
   cp backend/toolbox-script/Code.gs backend/toolbox-script/Admin.html backend/toolbox-script/appsscript.json /workspace/toolbox-script/
   cd /workspace/toolbox-script
   clasp create --type standalone --title "台中全時間服事百寶箱後端"
   clasp push -f
   clasp open-script   # 用瀏覽器打開專案
   ```
   （`clasp create` 會產生 `.clasp.json`，裡面只有 scriptId，可以保留。`~/.clasprc.json` 是登入憑證，不可複製進任何 repo。）
2. **執行 setup 並授權**：在 Apps Script 編輯器上方選函式 `setup` →「執行」→ 出現「需要授權」時選自己的帳號 →「進階」→「前往（不安全）」→「允許」。執行完成後，雲端硬碟會多一個試算表「台中全時間服事百寶箱投稿」，`SHEET_ID` 和 `ADMIN_EMAIL` 會自動寫入指令碼屬性。
3. **設定管理密碼**：左側「專案設定」（齒輪）→ 最下面「指令碼屬性」→「編輯指令碼屬性」→ 新增屬性 `ADMIN_PASSWORD`，值自己決定（建議 16 字以上，不要和 Google 密碼相同）→ 儲存。密碼不要寫在任何檔案、訊息或聊天裡。
4. **部署網頁應用程式**：右上「部署」→「新增部署作業」→ 齒輪選「網頁應用程式」→ 說明填「v1」→「執行身分：我」→「誰可以存取：所有人」→「部署」→ 複製「網頁應用程式網址」（結尾是 `/exec`）。
5. **接上前端**：把 `/exec` 網址填進 `toolbox/config.js` 的 `API_URL`，commit 後推上分支。
6. **審核頁**：`<上面的 /exec 網址>?page=admin`。用 Isaiah 的帳號開啟或輸入管理密碼即可審核。
7. **之後改程式**：`clasp push -f` 後，在「部署 → 管理部署作業」編輯現有部署、版本選「新版本」，網址不會變。

## 快速檢查

- `<exec>?action=list` 應回 `{"ok":true,"items":[]}`。
- 在百寶箱頁面最下面投稿一筆 → 審核頁「待審」出現 → 核准 → 約 5 分鐘內（清單快取）百寶箱頁面出現該連結；核准／退回／刪除會立即清快取。
