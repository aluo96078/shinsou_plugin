# Shinsou Community Plugins

這個儲存庫現在只發布 `shinsou-extension-v2` 套件，v2 索引與所有可用腳本都位於專案根目錄。舊版 v1 根目錄套件（舊 `index.json`、`plugins/`、`src/`）已移除，不再維護或發布。

## 套件內容

- `index.json`：v2 套件索引（`contractVersion: 2`）
- `repo.json`：儲存庫資訊
- `plugins/`：具獨立 SHA-256／byte size 綁定的 v2 執行腳本
- `sidecars/`：權限、內容型別、SourceKey 與 system-event 宣告
- `merged-shuyue/`：僅供既有資料遷移與測試使用的 legacy fixture，不是可安裝的 v1 套件

套件包含 ShuYue 小說擴充：

- `zh.wenku8.api`：維護中的文庫 relay 來源
- `zh.biquge.tw`：筆趣閣來源
- `zh.wenku8`：只作舊資料相容遷移，不列入新安裝

`example.login` 是參考實作，同樣標示為不可安裝。所有套件的 executable artifact、sidecar 與權限宣告都由根目錄 `index.json` 綁定。

## 使用方式

本地測試時，從專案根目錄啟動靜態伺服器：

```bash
python3 -m http.server 18081 --directory .
```

Shinsou X 應加入：

```text
http://127.0.0.1:18081/index.json
```

區域網路測試時，將 `127.0.0.1` 換成主機的內網位址。舊的 `/v2/index.json` 路徑已不再提供。

## 驗證

```bash
node test/v2-migration-smoke.js
```

測試會驗證根目錄 v2 索引、腳本 digest、sidecar 綁定、權限與 ShuYue 對應；不會登入第三方網站或發送正式來源請求。

完整的 v2 欄位、sidecar digest、SourceKey 與 system-event 規則請參考
[`shinsou_kmp/docs/PLUGIN_SYSTEM_EVENT_ARCHITECTURE.md`](https://github.com/aluo96078/shinsoux/blob/master/docs/PLUGIN_SYSTEM_EVENT_ARCHITECTURE.md)。
