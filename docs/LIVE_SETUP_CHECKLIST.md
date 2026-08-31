# Live setup checklist (Windows / ChatGPT Work)

Phase 3は必ず`feature/automated-job-hunt-phase2`の最新commitから開始する（Phase 2.5完了commitを参照。`source` branchを起点にしない）。

1. CSV初期投入はアプリの「データ管理」>「候補企業を初期投入」から`monitoring-targets-phase0.6.csv`を選び、previewを確認してから反映する。Login ID、password、tokenその他private列を含むCSVは拒否される。CSVは初回だけの入力で、ランキング、選考、評価、承認済みFactは変更しない。
2. Supabaseで新規Free projectを作成し、SQL Editorへ`supabase/migrations/202608250001_automated_job_hunt.sql`を貼り付けて実行する。
3. Authentication > Providers > Googleを有効化し、Google Cloudで発行したClient ID/Secretを入力する。Redirect URLにSupabaseが表示するCallback URLを追加する。Gmail/Drive scopeは追加しない。
4. Project Settings > APIからProject URLとPublishable/anon keyを取得し、GitHub Repository Variablesの`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`へ入れる。service_role keyは絶対にVITEへ入れない。
5. Pages workflowのbuild envを`VITE_STORAGE_MODE=supabase`へ変更してdeployする。default branchのscheduled workflowも確認する。
6. Edge Functionへ`collector-ingest`をdeployし、Supabase secretsにowner user UUID、Gmail/Webそれぞれ別tokenを設定する。tokenはGitHub/Apps ScriptのSecret/Propertiesだけへ入れる。
7. Google Apps ScriptのGmail collectorは、コード同期後に次の順で設定する。Script Propertiesへ`INGEST_URL`、`COLLECTOR_TOKEN`、`EXPECTED_GMAIL_ACCOUNT`（`<collector Gmail address>`）、`BACKFILL_SINCE`、必要なら`BACKFILL_BATCH_SIZE`を設定する。値は公開リポジトリに入れない。Gmail APIの高度なサービスを確認し、`validateCollectorConfiguration()`でアカウント一致と必須設定の存在だけを確認する（値やGmail本文はログ出力しない）。手動のincremental runが成功し、`LAST_SUCCESSFUL_SYNC`とCollector状態を確認してから、`runDailyIncremental`の日次triggerを1件だけ有効化する。
8. Web Collectorは`COLLECTOR_DRY_RUN=true pnpm run collector:dry-run`でstate/Findingを書き込まないdry-runを行う。live runは`COLLECTOR_DRY_RUN=false node tools/web-collector/run.mjs`。初回成功時はbaseline hashのみ保存、差分時のみFindingを作る。失敗はattempt/errorを記録するが、前回成功hashとlast_successを維持する。
9. 日常運用では企業・選考画面から候補企業を追加し、同期により`monitoring_targets`を作成する。private MyPage CSVはimport/commitしない。

E2EはWindowsで`pnpm run test:e2e`を実行する。Vite dependency optimizationのfilesystem permission errorが再発した場合だけ`node_modules/.vite`を消して再試行し、lockfileやdependency versionを変更しない。
