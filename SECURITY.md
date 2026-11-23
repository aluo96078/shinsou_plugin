# 安全政策｜Security Policy

## 回報漏洞｜Reporting a Vulnerability

**請勿在公開的 GitHub Issue、Discussion 或 Discord 頻道揭露漏洞。**
**Do not disclose vulnerabilities in public GitHub issues, discussions, or Discord channels.**

請寄信至 / Email: **aszxc96078@gmail.com**，主旨以 `[Security] shinsou_plugin` 開頭。

適用於本儲存庫中的外掛與簽章流程，例如 / In scope for this repository, for example:

- 外掛送出未在 `requestOrigins` 宣告、或與來源無關的網路請求 / Plugins sending undeclared or unrelated network requests
- 外掛把 Cookie、帳密或其他使用者資料傳到第三方 / Plugins forwarding cookies, credentials, or user data to third parties
- 簽章、`publisher-revocations.json` 撤回清單或 CI 自動簽章流程的問題 / Issues in signing, the revocation list, or the CI signing workflow
- 發佈者私鑰可能外洩 / Possible exposure of the publisher private key

信中請提供受影響的套件 ID、版本與重現步驟；寄出前請移除 Cookie、Token、密碼與電子郵件等私人資料。
Include the affected package ID, version, and reproduction steps. Remove cookies, tokens, passwords, and email addresses before sending.

收到後會在 7 天內回覆確認；確認問題後會發佈修正版或撤回受影響的版本。修正發佈前請勿公開細節。
We aim to acknowledge reports within 7 days, then ship a fix or revoke affected versions. Please keep details private until then.

外掛單純「抓不到內容」或「網站改版」不屬於安全問題，請開一般 Issue。App 沙箱或權限機制本身的漏洞請回報至 [shinsoux](https://github.com/aluo96078/shinsoux/blob/master/SECURITY.md)。
Broken sources caused by website changes are not security issues; open a regular issue. Report sandbox or permission flaws in the app under shinsoux.
