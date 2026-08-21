# Job Hunt Manager v2 面接ガイド

## 30秒説明

「約50社の選考・締切・評価・採用情報変化が分散する課題から、React/TypeScriptで就活管理アプリを作りました。初版のlocalStorage単一Companyを実運用視点で見直し、Company Masterと本人情報の分離、自由な評価項目、根拠付きFact、AI差分承認、Google Drive保存境界へ発展させました。119件のunit/componentと6件のEdge機能E2E＋2件の撮影テストで確認し、Google実接続だけは未試験と明記しています。」

## 1分説明

「中心機能は企業検索ではなく、応募企業を登録した後の継続管理です。企業CRUD、複数選考、締切、検索、Dashboardに加え、v2では企業そのものを恒久IDのMaster、応募状況をUser Companyへ分けました。評価は固定weightをやめ、項目、最大点、weightを変更でき、未評価を0点にせず暫定scoreとcoverageを表示します。採用情報はSource、確認日、年度、確認level付きFactです。ChatGPT等の結果はZodで検証し、差分previewと人の承認後だけWatchへ反映します。保存はrepositoryへ分離し、LocalとGoogle Drive appDataFolderを差し替えられます。Gmail自動監視や有料APIは未実装です。」

## 変更前と変更後を図で説明

```text
v1: Company { 企業名 + 応募 + 採用情報 + 固定scores + events }

v2: Master Company ← User Company → Selection Event
                         ├→ Evaluation ← Scoring Profile
                         ├→ Research Fact → Source
                         └→ Watch Finding
                         ↓
                  StorageRepository
                    ├ Local dev
                    └ Drive appDataFolder
```

## 想定質問

### 1. なぜ作りましたか

約50社では情報と締切が散らばり、次の対応判断が難しいためです。成果物だけでなく自分が継続利用する道具にしました。

### 2. なぜv2へ改修しましたか

初版を1人用として完成させた後、企業/本人情報混在、固定ランキング、出典なし、複数端末、AI結果転記が次の課題だと分かったためです。

### 3. なぜReact/Viteを維持しましたか

既存UIが動き、手動AI SyncとDrive RESTはSPAで成立します。SEO/SSRや定期backend処理が今回不要なので、境界改善の価値が高いと判断しました。

### 4. Company Masterとは何ですか

名称変更に影響されない恒久IDを持つ企業そのものです。本人の選考やmemoはUser Companyへ置きます。

### 5. 企業名を自動mergeしない理由は

表記が似ても別会社の可能性があり、誤mergeすると選考データを別企業へ結びます。正規化は候補提示だけに使います。

### 6. scoringを説明してください

各criterionを`score/scaleMax`で正規化しweightを掛け、評価済みweightだけで100点換算します。coverageは評価済みweight/全有効weightです。

### 7. 未評価を0点にしない理由は

「悪い」と「まだ調べていない」は違うからです。0点扱いは情報不足企業を不当に下げます。

### 8. scaleMax変更時は

IDを維持し、4/5なら8/10のように百分率を保って既存値を比例変換し、範囲へclampします。UIで確認も出します。

### 9. Research Factが必要な理由は

「Webテスト=○○」という値だけでは、いつ・何年度・どの出典か判断できません。source metadataと確認levelを一緒にします。

### 10. AIを一次情報にしますか

しません。公式ページをAIが整理した場合もevidenceはofficial_web、processedByAiを別fieldにします。

### 11. AI Syncを安全にした方法は

parse、Zod validation、企業照合、diff preview、個別選択、delete追加確認、revision再確認、commitの順です。

### 12. 重複をどう防ぎますか

AI operationはoperationId、Watch Findingは企業+fingerprintで重複を防ぎます。completedは同じ再取込でnewへ戻しません。

### 13. 今日の対応順はAIですか

いいえ。期限超過、24時間、3日、7日、severity、同条件でscoreという透明なruleです。適合度ランキングとは別です。

### 14. StorageRepositoryの利点は

UIはload/saveだけを知り、Local/Drive/Mockを差し替えられます。外部APIなしでも同じcontractをtestできます。

### 15. Drive scopeは

`drive.appdata`だけです。identityはopenid/email/profile。広いDriveやGmail scopeは要求しません。

### 16. tokenをどう扱いますか

React/browser memoryだけで、localStorage/sessionStorage/IndexedDBへ永続化しません。logoutでaccount/personal stateと共にclearします。

### 17. 競合はどう防ぎますか

loadしたDrive versionとAppData revisionを保持し、save前にremoteを再読込して違えばPATCHを止め、local JSON退避とremote reloadを提示します。

### 18. 競合対策の限界は

Drive v3の原子的If-Match保証を確認できておらず、事前確認とPATCH間にrace windowが残ります。実Google試験も未実施です。

### 19. v1移行で守ったものは

原文、旧key、Company ID、events、memo、timestamps、旧scoreです。出典なし情報はunverified Factにします。

### 20. どんなtestをしましたか

migration、scoring、matching、Fact、AI/Watch、Local/Drive、Authをunit/componentで119件、主要user flowをEdge機能E2Eで6件です。加えてPC・モバイルの証跡撮影2件を実行し、Playwright全体では8件です。

### 21. 実際に起きたv2のerrorは

機能E2Eのtext selectorがJSON textareaとheading両方へ一致しました。roleをheadingへ限定し、機能6件を再成功させ、撮影2件を含む全8件も通しました。

### 22. なぜGoogle実試験をしていませんか

本人login、2FA、Client ID、consentは本人操作が必要で、Billing禁止条件もあります。codeを止めずMock/contractまで完成させ、未試験と明記しました。

### 23. Gmailを実装しなかった理由は

Restricted scope、verification、token管理、privacy、browser外schedulerが必要です。今回のSPAだけで「毎朝監視」を偽装しません。

### 24. AI協働をどう説明しますか

課題・仕様・安全条件は自分が決め、Codexを実装/検証支援に使い、test、Git、evidenceで確認したと説明します。

### 25. 次に何をしますか

まず本人によるGoogle設定と2端末実試験です。その結果を受けて競合UXを改善し、その後に通知やbackend Watchの費用/審査を再評価します。

## 練習方法

1. 30秒説明を暗記せず、自分の語彙へ直す。
2. 上図を見ずに紙へ描く。
3. 質問6、11、17へコードを開かず答える。
4. 「実装済み」「Mockのみ」「将来」を必ず分ける。
