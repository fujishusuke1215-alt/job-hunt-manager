# Job Hunt Manager

就職活動で分散しやすい企業情報、選考状況、締切、評価、更新情報を一元管理する React / TypeScript アプリです。本人用の自動化では、採用メールと公開採用ページを収集し、企業を特定して、明示的な事実を選考履歴・予定・ホームの「今日の要対応」へ反映します。

**公開サイト:** https://fujishusuke1215-alt.github.io/job-hunt-manager/

公開サイトには、ログイン不要で試せる完全架空の Demo と、Google Login 後の個人用ワークスペースがあります。Demo に実在企業、実応募状況、メール、アカウント情報は含みません。

## 開発背景

応募候補が増えると、Gmail、企業採用サイト、MyPage、締切、選考状況、企業評価が別々の場所に分かれます。確認作業に時間を取られ、見落としや判断の遅れが起こりやすいことが課題でした。

そこで、情報を探し回る代わりに、必要な情報を構造化して集め、次の行動だけをホームで確認できる仕組みを実装しました。企業や日時を確定できない例外だけを内部監査対象として残し、明白な受付完了・期限・企業一致は自動処理します。

## 主な機能

- Google Login とユーザー単位で分離されたデータ保存
- 企業、選考イベント、締切、評価、Research Fact の管理
- Gmail本文から期限・面接日時・対応種別を解析し、根拠付きActionとして自動反映
- 今日の要対応、直近7日、日程競合と企業評価の比較を確認するダッシュボード
- ActionからMyPageと元Gmail検索を直接開く導線
- 企業ごとの評価値を一度だけ保持し、目的別Profileでは重み付けだけを切り替えるランキング
- 高確度の採用メールだけから、新規企業・監視対象・限定Gmail backfillを安全にオンボーディング
- CSV の preview / validation を経由した候補企業と監視対象の初期登録
- Collector evidence の企業解決、自動処理、重複防止、監査ログ
- 応募候補の追加・更新から監視対象を派生させる Dynamic Monitoring
- 完全架空データだけで試せる公開 Demo

## 一般公開機能と Owner 専用自動化

一般公開部分は、Google Login、企業・選考・締切・評価の管理、Finding review、Demo、ユーザー分離を提供するアプリです。

一方、Gmail の収集、過去メールの backfill、個人の監視対象の初期投入、公開採用ページの定期収集は **Owner Personal Automation** として分離しています。これは所有者の個人運用向けであり、一般ユーザー向けに Gmail の自動連携を提供するものではありません。通常の Google Login は基本プロフィール情報のみを利用し、Gmail / Drive scope は要求しません。

## Architecture

```mermaid
flowchart LR
  UI[React + TypeScript] --> AUTH[Supabase Auth]
  UI --> DATA[(Supabase / RLS)]
  UI --> ACTIONS[Actions / 選考履歴]
  CSV[Private monitoring CSV] --> IMPORT[Preview + validation]
  IMPORT --> DATA
  WEB[GitHub Actions Web Collector] --> INGEST[Supabase Edge Function]
  GMAIL[Owner Apps Script + Gmail API] --> INGEST
  INGEST --> FINDINGS[(Collector evidence / audit)]
  FINDINGS --> ACTIONS
  ACTIONS --> DATA
```

Collector evidence は内部監査ログとして保持し、日常画面で1件ずつ承認する運用にはしません。明白な期限、Webテスト、面接予約、提出・完了、合否だけを根拠付きAction／選考履歴へ反映し、fingerprint とAction種別・日時で重複を抑制しています。添付の有無だけで本文解析を止めず、曖昧な通知のみ例外として残します。

## Security / Privacy

- Supabase Row Level Security によりログインユーザーごとのデータを分離
- Demo はログイン済みデータと分離し、架空データのみを表示
- service role、OAuth secret、collector token、Gmail token はブラウザやリポジトリに置かない
- 個人用の監視 CSV と MyPage 用 private CSV は Git 管理から除外
- Gmail は本文全文や password、認証コードを正式データとして保存しない。必要最小限の根拠抜粋、メッセージ識別子、Gmail検索リンクだけを保持する
- MyPage Login ID は本人用RLSテーブルのみに保存し、passwordは保存しない
- GitHub Actions は secret を workflow の安全な実行コンテキストでのみ参照

公開用の CSV 例は [docs/monitoring-targets.example.csv](docs/monitoring-targets.example.csv) を参照してください。全行が架空の企業と URL です。

## Tech Stack

- React, TypeScript, Vite
- Supabase Auth, Postgres, RLS, Edge Functions
- Google Apps Script / Gmail API（Owner 専用）
- GitHub Actions（公開採用ページの定期監視）
- GitHub Pages

## Setup

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm run dev
```

環境変数と本番設定は [.env.example](.env.example) および [docs/LIVE_SETUP_CHECKLIST.md](docs/LIVE_SETUP_CHECKLIST.md) を参照してください。実運用では Supabase の Google provider、RLS、Edge Function、GitHub Actions secrets を設定します。個人 Gmail を扱う Owner Personal Automation は公開アプリの通常ログインとは別に設定します。

## Testing

```powershell
pnpm run lint
pnpm run test
pnpm run build
pnpm run test:collector
```

## Owner automation flow

新しい企業を保存すると監視対象が同期され、企業名・別名・送信元ドメインに絞ったGmail backfill requestをキューへ登録できます。Owner Apps Scriptの日次処理がキューを消化するため、ブラウザからGmail Restricted APIを呼びません。既存Findingを再処理する前には本人DBのバックアップを取得し、公開リポジトリには含めません。

ランキングの評価値は企業ごとに一つだけ保持します。Profileを切り替えても値の再入力や確定評価の上書きは発生せず、同じ評価値に対する重みだけが変わります。未評価は0点として補完せず、一覧・比較では末尾に表示します。

詳しい制作意図と面接向けの説明は [docs/PORTFOLIO_DESCRIPTION.md](docs/PORTFOLIO_DESCRIPTION.md) にまとめています。
