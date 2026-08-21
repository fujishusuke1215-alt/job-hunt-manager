# 要件定義 v2

## 出典の区別

- **明示的に決定済み**: 過去会話またはユーザーのv2指示に書かれたもの。
- **AI補完**: 要件を安全に接続するためCodexが選び、変更可能なもの。

## 目的と利用者

### 明示的に決定済み

- 自分が受ける約50社規模を、登録後も継続管理できる実用品にする。
- 大手IT企業等へ、初版から課題を発見してv2へ改善した経験として説明する。
- 初心者が「何を、なぜ、どう変えたか」を追える証跡を残す。
- 本人用と採用担当者が見る公開デモを分離する。
- 将来の一般利用者を考えるが、今回企業検索サイトや広告を完成させない。

## 機能要件

| 領域 | 明示的に決定済み | 実装 |
|---|---|---|
| 企業管理 | CRUD、企業と本人関係の分離、Master恒久ID、独自企業、後からlink | 完了 |
| 企業照合 | NFKC等で候補検索、曖昧候補を自動統合しない | 完了 |
| 選考 | status、ES/テスト/面接/締切、場所、メモ、複数event | 完了 |
| 評価 | 自由な項目名/説明/最大点/weight/順序、有効/無効、profile複製 | 完了 |
| 計算 | 未評価を0にせずprovisional scoreとcoverage、安定tie-break | 完了 |
| 調査情報 | valueだけでなくsource、確認日、年度、確認レベル、AI整理有無 | 完了 |
| AI Sync | JSON選択/貼付、runtime validation、差分、個別選択、承認後反映、履歴 | 完了 |
| Watch | Finding保存、重複防止、new/seen/completed/dismissed、Center | 完了 |
| Dashboard | 締切とWatchの今日対応、適合度ランキングとは分離 | 完了 |
| 検索 | 企業名、職種、メモ、Fact、status/priority/eligibility/deadline filter | 完了 |
| Backup | schema v2 export、v1/v2 import、preview後commit、invalid非破壊 | 完了 |
| Migration | v1原文退避、ID/event/memo/time保持、Legacy profile | 完了 |
| 保存 | StorageRepository、Local開発、Drive appDataFolder、競合停止 | コード/Mock完了 |
| 認証 | GIS現行Token model、限定scope、tokenメモリ、logout clear | コード/Mock完了 |

## 評価項目候補の復元

### 明示的に決定済み

給与、福利厚生、WLB、リモート、フレックス、海外可能性、IT/DX一致、応募資格、既卒可否、職歴あり可否、Webテスト、コーディングテスト、志望度、総合点、選考状況を扱えること。

### v2での整理

- 志望度、手動優先度、応募状況、MyPage、選考、メモはUser Company。
- 給与、福利厚生、働き方、応募資格、テスト情報は出典付きResearch Fact。
- 点数化する項目はScoring Profileで自由に定義し、Factの存在と点数を混同しない。
- 開発者参考テンプレートは指示された9項目/合計100を同梱するが強制しない。

## AI補完した判断

- 一般テンプレートを7項目で用意する。
- 同じ丸め後scoreは同順位とし、coverage、表示名、IDで表示順を決定する。
- runtime validationにZodを1依存だけ追加する。
- Drive保存はsubmit等の明示変更単位でqueueし、キー入力ごとに送らない。
- Google設定なしのdevではlocalStorageを明示表示し、production既定はdisabledにする。
- Drive v3の原子的If-Match保証を前提にせず、version+AppData revisionの事前確認で停止する。

## 非機能・安全要件

- React/Viteと既存UIを維持し、全面刷新しない。
- PCと390px幅で操作できる。
- TypeScript、lint、build、unit/component、可能なE2Eを成功させる。
- demo、test、screenshotには架空企業だけを使う。
- `.env.local`、secret、password、OAuth token、Cookie、個人データをGitへ入れない。
- URLはhttp/httpsのみ。AI JSONをHTMLとして挿入しない。
- Gmail scope、Gmail本文取得、有料AI API、Billing、カード、課金trialを使わない。
- 競合時は黙って上書きせず、local JSON退避とremote再読込を提示する。

## 今回実装しない

- Gmail自動監視、Restricted scope、メール本文取得
- 採用Webの自動巡回、ブラウザーを閉じた後のscheduler
- OpenAI/Gemini等の有料API呼出
- 中央共有企業DB、一般企業検索、SEOページ、広告
- FastAPI、PostgreSQL、Docker、Next.js全面移行、外部hosting
- 自動mergeと危険な自動delete

## 完了判定

実装Acceptance Criteria 42項目を、機能・移行・評価・Master・AI/Watch・保存/Auth・テスト・docs・security監査で確認します。ただし本人認証が必要な実Google接続だけは「未試験」と明示し、Mock/contract成功をもって今回のコード完成範囲とします。
