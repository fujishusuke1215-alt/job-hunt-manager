# 開発ストーリー: localStorage初版からv2へ

## 1. 初版の課題設定

複数企業を並行して受けると、応募条件、テスト、締切、面接、志望度が散らばり、次の行動が見えにくくなります。そこでReact/TypeScriptで企業CRUD、複数Selection Event、検索、固定ランキング、localStorage、公開デモを作りました。

## 2. 初版で実際に起きた問題

実ブラウザーのLAN内HTTPでは`crypto.randomUUID()`が利用できず登録が止まりました。機能検出とfallbackを持つ`createId()`へ直し、同じflowを再実行しました。またVitestとPlaywrightの探索範囲が重なったため、test対象を分離しました。

## 3. 使い続けるために見えたv2課題

初版のCompanyには企業名、応募状況、採用情報、評価、選考が混在していました。これでは名称変更、複数ユーザー、共通企業情報へ発展しにくく、点数weightも固定です。さらに採用情報へ出典がなく、ChatGPTの毎朝調査結果を構造化して安全に取り込めません。localStorageだけでは複数端末も扱えません。

## 4. 全面再構築しなかった判断

既存Dashboard、Company List/Detail/Form、CSS、テスト、Gitの4commitは良い資産でした。React/Viteを保ち、domainとrepositoryを先に追加してからUIを段階的に接続しました。旧`src/types.ts`と`src/services/storage.ts`はv1互換・歴史として残し、型を一括置換して全画面を同時破損させる方法を避けました。

## 5. 非破壊migration

v1 keyを見つけたら、validationより先に原文を別legacy keyへ退避します。検証後、Company ID、event、memo、created/updated timeを維持し、旧weightを再現する`Legacy v1` profileをactiveにします。出典なし応募資格/テストは`unverified` Factへ移し、旧keyも即削除しません。

## 6. 企業と評価の分離

Company Masterは恒久ID、正式名、alias、former name、domain、merge先を持ちます。User Companyは本人の応募・選考です。表記正規化は候補表示にだけ使い、Master IDにはせず、曖昧なら自動mergeしません。

Scoring Profileは任意criteriaを持ちます。未評価を0点とせず、評価済みweightで暫定score、全weightとの比でcoverageを出します。scaleMax変更は同じ百分率になるよう既存点を比例変換します。

## 7. AIを安全な候補生成へ限定

ChatGPT会話やmemoryをアプリから直接読む前提を捨て、JSON import/exportにしました。Zod検証、企業照合、before/after、個別選択、delete追加確認、operationId重複防止、revision再確認を通ってからだけ本データへ反映します。Watch Findingはfingerprintで重複を防ぎ、completedを勝手にnewへ戻しません。

## 8. 保存境界とGoogle

StorageRepositoryをLocal/Driveから分けました。GoogleはGIS Token model、`openid email profile drive.appdata`だけを使い、tokenはメモリに置きます。Drive保存前はremote versionとAppData revisionを再確認し、変化時はJSON退避とreloadを提示します。

実Google accountは使わず、Mock/contract 28件まで確認しました。Drive v3の原子的ETag更新を保証できないためrace windowも限界として残しました。

## 9. v2で実際に起きたエラー

- ZIP由来`node_modules`のpnpm link/ACLを信用できず、lockfileから再構築。
- Codex shellでNodeがPATHにない場面があり、同梱Nodeの絶対pathでCLIを実行。
- E2Eの`getByText`がJSON textareaと差分headingの2件に一致しstrict modeで失敗。`getByRole('heading')`へ限定して再成功。
- 旧screenshot specがPhase 3〜5画像へ書くことを監査で発見。初回実行で変わった3画像だけを、開始時cleanを確認済みだったため復元し、v2出力先をPhase 11以降へ変更。

## 10. 完成確認

TypeScript、ESLint、production build、119 unit/component、6 Edge E2Eに成功しました。スクリーンショットは架空Webアプリ領域だけです。既存コミットを消さず、v2もdata、scoring/master、AI/watch、Google、UI、test/docsの単位で追加しました。

## 11. 誠実に残す未完了

Google実login/Drive同期、Gmail自動監視、Web定期調査は未実施です。外部公開はPhase 18で架空demoのproduction build 4ファイルだけをGitHub Pagesへ配信しました。完成した本人用機能は「安全な手動AI Syncと、実Google接続前までのAuth/Driveコード・Mock」です。
