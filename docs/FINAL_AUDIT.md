# Job Hunt Manager v2 最終監査

監査日: 2026-08-21

対象: Git追跡対象、v2文書・E2E・証跡画像、ローカルbuild

判定: **ローカル利用・GitHub掲載準備は合格。実Googleアカウント接続だけ未確認。**

## Function

- [x] 既存UIトーンを維持し、PC幅と390px幅で操作できる。
- [x] 企業の作成・表示・編集・削除が動く。
- [x] 選考予定の作成・編集・状態変更・削除が動く。
- [x] 選考status、締切、期限超過、7日以内、面接情報、メモを扱える。
- [x] 検索、複合filter、並び替え、Dashboardが動く。
- [x] 公開デモと本人用データを分離している。
- [x] 「企業適合度」と「今日の要対応」を別概念として表示する。
- [x] Watchは手動AI JSON取込だけと明記し、Gmail/Web自動監視を装っていない。

## Migration・Data model

- [x] `schemaVersion: 2`と`revision`を持つ`AppDataV2`がある。
- [x] Company Catalog、User Company、Research Fact、Scoring Profile、Evaluation、Selection Event、Watch Run/Findingを分離した。
- [x] Company Masterは企業名由来ではない恒久IDを使う。
- [x] v1キーを検出し、原文をlegacy backup keyへ保存してから検証・移行する。
- [x] v1の企業数、ID、events、memo、createdAt/updatedAtを保持するテストがある。
- [x] v1採用情報は`legacy`、`unverified`、`checkedAt: null`として移す。
- [x] v1評価を`Legacy v1` profileへ移し、旧ランキングを再現する。
- [x] invalid v1/v2 JSONで現在データを変更しない。
- [x] v2外部JSONのID重複、孤児参照、評価範囲、active profile、Catalog merge循環を拒否する。
- [x] v1 import、v2 export、preview後commitに対応する。

## Scoring・Company Master・Research Fact

- [x] 評価項目名、説明、最大点、weight、有効/無効、順序を変更できる。
- [x] profile作成、複製、active切替ができる。
- [x] 未評価を0点とせず、暫定点とcoverageを計算する。
- [x] weight合計が100でなくても比率として正規化する。
- [x] scaleMax変更時に既存点を割合維持で変換し、範囲へclampする。
- [x] Master ID、alias、正規化名、official domainで候補を探す。
- [x] 複数候補を自動統合せず、独自企業と後からのMaster linkを扱う。
- [x] link後も選考、メモ、志望度、events、評価を保持する。
- [x] Research Factに出典、確認日、対象年度、検証level、review status、AI整理フラグを保存・表示する。
- [x] 「応募前に公式情報を確認する」注意を常時表示する。

## AI Sync・Watch

- [x] ZodでAI Sync JSONをruntime validationする。
- [x] JSONファイル選択と貼付入力、差分preview、個別/全選択、承認後反映、取消、履歴がある。
- [x] preview中は本データを変更しない。
- [x] ambiguous companyを停止し、AI deleteは追加確認を要求する。
- [x] operationIdとfingerprintで重複反映を防ぐ。
- [x] 同一Envelope内の企業作成から関連Fact/Event/Findingまでoperation順でpreviewし、commit後もv2全体を再検証する。
- [x] completed findingを同一importでnewへ戻さない。
- [x] Watch Centerでnew、要対応、完了、企業、severityを確認できる。
- [x] AI分析用exportはtoken/secretを含まず、個人メモ・選考場所・イベントメモは明示opt-inである。

## Google・Storage

- [x] UIから保存先を分離する`StorageRepository`がある。
- [x] Google設定なしでは画面に「ローカル開発モード」と明示する。
- [x] 本番で設定なしのまま本人用localStorageへ黙ってfallbackしない。
- [x] GIS Token model用コードとGoogle Drive `appDataFolder` Repositoryがある。
- [x] scopeは`openid email profile https://www.googleapis.com/auth/drive.appdata`だけである。
- [x] 広いDrive scopeとGmail scopeを要求しない。Gmail文字列は拒否を確認するnegative testと将来interfaceだけにある。
- [x] access tokenをProviderのメモリ内だけで保持し、Web Storageへ永続化しない。
- [x] client secretをfrontendへ置かず、Client IDは`.env.local`想定、`.env.example`はplaceholderだけである。
- [x] 403の一時理由、429、500/502/503/504だけを有限指数backoffで再試行する。
- [x] Drive `version`とAppData `revision`が変化した場合は保存を止め、ローカル案をJSON退避できる。
- [x] 競合中は本人用編集を停止し、remote再読込前にlocal案を自動退避する。
- [x] backup importはRepositoryのpreview/commitを通り、保存成功確認後だけ画面を置き換える。
- [x] local v1を本人確認後にDriveへ移す導線がある。成功後も旧localデータを即削除しない。
- [x] Mock/contractでempty remote、existing remote、load、save、retry、permanent failure、conflict、Auth状態を確認した。
- [ ] 本人Googleログイン、OAuth同意、実`appDataFolder`保存、別端末読込は未確認。

実Driveの保存前再確認とPATCHの間にはrace windowがあります。Drive API v3で原子的な条件付き更新を実アカウント確認できていないため、「完全な競合防止」や「実同期確認済み」とは表現しません。

## Quality

| 検査 | 実行結果 |
|---|---|
| `pnpm run lint` | 成功 |
| `pnpm exec tsc -p tsconfig.app.json --noEmit` | 成功 |
| `pnpm run test` | 24 files / 119 tests 成功 |
| `pnpm run build` | 143 modules、production build成功 |
| `pnpm run test:e2e` | Edgeで機能6件＋撮影2件、計8件成功 |
| 実ブラウザー確認 | 主要4画面表示、console error 0件 |

最初の機能E2EではAI候補名がJSON textareaとheadingの両方へ一致しました。文字列だけのlocatorをrole付きheadingへ変更し、全件再成功しました。撮影時のsandbox権限エラーは、ローカルテストだけに限定した許可済み実行で解消しました。

## Security

- [x] `.env`、`.env.*`、`*.local`をignoreし、`.env.example`だけを許可している。
- [x] `node_modules`、`dist`、coverage、Playwright出力、logをGit除外している。
- [x] secret形式、client secret実値、API key、private key、OAuth token実値を検出しなかった。
- [x] `dangerouslySetInnerHTML`を使用していない。
- [x] 入力・import URLはhttp/httpsだけを許可する。unsafe legacy URLはリンクにせず、元情報を未確認Factとして保持する。
- [x] 外部リンクは`rel="noreferrer"`を使う。
- [x] logoutでtoken、account表示、personal state、Repository参照をclearする。
- [x] 無効JSONはparse・validate段階で止まり、現在データを変更しない。

## Data・Screenshot

- [x] ソース、テスト、v2画像は完全な架空企業・`.example`/`.test` URLだけを使用する。
- [x] 氏名、実メール、電話、住所、password、Cookie、実応募状況、面接内容、担当者情報を含めない。
- [x] Windowsデスクトップ全体を撮影せず、Webアプリだけを撮影した。
- [x] Phase 0〜10の歴史画像をv2撮影で上書きしないよう、出力先をPhase 12〜17へ分離した。

## Git

- [x] 開始時に`main`、clean、既存4commit、remoteなしを確認した。
- [x] 既存commitを削除、squash、再初期化していない。
- [x] v2を設計、data/migration、scoring/master、AI/Watch、Google/Drive、UI、test、docsの理解可能な単位へ分けた。
- [x] `.env.local`、`node_modules`、`dist`、`test-results`を追跡していない。
- [x] 外部remote追加、GitHub push、公開を行っていない。

## Docs・Evidence・Portfolio

- [x] README、00〜11、Google setup、AI Sync format、公開roadmapを現行実装へ更新した。
- [x] Phase 0〜10を歴史として保持し、Phase 11〜17を追加した。
- [x] 各新Phaseに変更前後、コマンド、実エラー、面接30秒説明、理解度チェック、答え、5分復習がある。画面Phaseは画像、domain/test Phaseはコード・実行結果を証跡にしている。
- [x] portfolioの要約、面接ガイド、初心者向け構成、開発ストーリー、AI利用説明を更新した。
- [x] AI協働範囲、ユーザー決定、Codex補完、検証済み、未確認を区別した。
- [x] Privacy、Terms、Google Data Usage、Aboutは実装と一致するdraftで、公開前の本人確認・法的レビューを明記した。
- [x] Gmail自動監視、Web定期調査、自動Push、一般企業検索、広告を実装済みと書いていない。

## 無課金・外部状態

- [x] Billing、カード、trial、有料API、有料DB、ホスティングを設定していない。
- [x] OpenAI/Gemini等の有料APIをアプリから呼ばない。
- [x] Google Drive APIの標準利用に関する説明は確認日付きで、将来変更可能と明記した。
- [x] Billing要求、カード要求、quota引上げが必要な場合は作業を止める方針である。
- [x] GitHub push、Google Cloud設定、外部公開は行っていない。

## 残る本人作業

- [ ] `docs/GOOGLE_AUTH_SETUP.md`を読み、Billingを有効化せずGoogle Cloud ProjectとWeb OAuth Client IDを本人が作成する。
- [ ] 実Googleアカウントでログイン、保存、再読込、別端末、競合表示、logoutを確認する。
- [ ] 各Phaseの理解度チェックへ自分の言葉で回答し、30秒・1分説明を練習する。
- [ ] GitHub公開前にリポジトリ名、公開範囲、連絡先placeholder、ライセンス、法的draftを本人が確認する。

これらは本人認証、実サービス接続、学習、公開判断であり、今回Codexが勝手に実行していない残作業です。
