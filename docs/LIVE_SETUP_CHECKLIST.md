# Live setup checklist (Windows / ChatGPT Work)

1. Supabaseで新規Free projectを作成し、SQL Editorへ`supabase/migrations/202608250001_automated_job_hunt.sql`を貼り付けて実行する。
2. Authentication > Providers > Googleを有効化し、Google Cloudで発行したClient ID/Secretを入力する。Redirect URLにSupabaseが表示するCallback URLを追加する。Gmail/Drive scopeは追加しない。
3. Project Settings > APIからProject URLとPublishable/anon keyを取得し、GitHub Repository Variablesの`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`へ入れる。service_role keyは絶対にVITEへ入れない。
4. Pages workflowのbuild envを`VITE_STORAGE_MODE=supabase`へ変更してdeployする。default branchのscheduled workflowも確認する。
5. Edge Functionへ`collector-ingest`をdeployし、Supabase secretsにowner user UUID、Gmail/Webそれぞれ別tokenを設定する。tokenはGitHub/Apps ScriptのSecret/Propertiesだけへ入れる。
6. Google Apps ScriptのGmail collectorを手動dry-runし、FindingにGmail本文全文や認証情報がないことを確認してからtriggerを有効化する。
7. `monitoring-targets-phase0.6.csv` は初回監査・移行用入力としてのみ使う。日常運用では企業・選考画面から候補企業を追加し、同期により`monitoring_targets`を作成する。private MyPage CSVはimport/commitしない。
