# Personal Ranking Import

本人用のExcel評価を、既存の `AppDataV2` へ安全に変換するローカル専用ツールです。入力Excelと生成JSONは個人データなのでGitへ追加しません。

処理は、Excel schema検証、企業名・CSV alias照合、曖昧な照合の停止、ranking-only企業の非監視追加、評価Profile生成、スコア・順位照合の順です。既存の選考、Finding、Monitoring Targetは変更しません。

`RANKING_IMPORT_PYTHON` に `openpyxl` を利用できるPythonを設定して実行します。

```powershell
pnpm tsx tools/ranking-import/import.mts --input <ranking.xlsx> --backup <user_app_data.csv> --monitoring <monitoring.csv> --output <private-output.json> --report <private-report.json>
```

出力reportで、未解決・曖昧企業が0件、総合点・順位の一致が全件であることを確認してから、既存のバックアップimport経路で保存します。
