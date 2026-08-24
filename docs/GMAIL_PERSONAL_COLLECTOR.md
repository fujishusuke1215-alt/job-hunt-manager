# Gmail Personal Collector

1. Apps Scriptで新規プロジェクトを作り、`tools/gmail-collector/Code.gs`を貼り付ける。
2. Advanced Google servicesでGmail APIを有効化する前に、実際のrequired scopeを確認する。初期実装はread-onlyの検索のみで、tokenや本文は保存しない。
3. Script Propertiesへ`INGEST_URL`、`COLLECTOR_TOKEN`、`BACKFILL_SINCE=2026-07-24`、任意で`BACKFILL_BATCH_SIZE`を設定する。値をソースへ書かない。
4. 最初は`runInitialBackfill`を手動実行し、Findingを確認する。完走後にtime-driven triggerで`runDailyIncremental`を起動する。失敗時はLAST_SUCCESSFUL_SYNCを進めない。
