# Automated Job Hunt

正式データは `user_app_data.app_data` のAppDataV2である。Gmail/Web collectorはこれを更新しない。collectorは`collector_findings`へ候補と短い根拠だけを送り、本人が画面で承認した時だけ既存Domain経由でAppDataV2へ反映する。

候補企業はSource of Truthであり、`syncMonitoringTargetsFromCandidates()`がidempotentに監視対象を派生する。職歴あり応募可否が`confirmed`/`eligible_no_exclusion_found`ならactive、`needs_review`ならwatchとreview Finding、`ineligible`ならexcluded。削除された候補はarchiveする。

Gmailは所有者専用Apps Scriptであり、公開Google LoginにGmail scopeを加えない。本文全文、password、token、private MyPage CSVはDB/commitに保存しない。
