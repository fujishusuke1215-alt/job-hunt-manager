# AIによる仮定と判断 v2

ユーザーが明示していない細部だけを、次のように補完しました。重要な目的や権限を拡張する仮定はしていません。

1. 新規ユーザーの一般評価templateは7項目、開発者参考templateは指示どおり9項目とする。
2. scoreが同じ場合、coverage、企業表示名、User Company IDで安定表示する。同じscoreは同順位にする。
3. Company Catalogは中央DBでなく、架空の静的JSON相当をrepository境界から読む。
4. Master候補は正規化完全一致またはdomain一致を提示するが、本人が選ぶまでlinkしない。
5. Research Factの手入力source初期値は`user`、確認levelは`unverified`、reviewは`draft`。
6. Driveのデータファイル名は`job-hunt-manager-data-v2.json`を1つとする。同名複数は自動選択しない。
7. Google設定なしの開発時だけlocalStorageを許可し、画面へ「ローカル開発モード」と表示する。
8. productionで設定なしの場合、Personal modeをdisabledにし、黙ったlocal fallbackをしない。
9. Driveへの保存はsubmit、status、import commit等のstate変更単位で行い、キー入力単位では行わない。
10. retryは一時的なquota 403、429、500/502/503/504だけを最大4回とする。無限retryしない。
11. Drive v3に原子的ETag条件更新を仮定せず、version+AppData revisionの事前競合検知に留める。
12. Watch Providerは手動AI JSONだけを実装し、Gmail/Web Watch Providerはcontractだけにする。AI連携はdomainのJSON取込serviceまでとし、外部AiProviderや有料AI実装は置かない。
13. Watchの今日対応は透明なruleで並べ、AI scoreを使わない。
14. AI分析exportは企業memo・event memo・選考場所を既定で除き、明示checkbox時だけまとめて含める。
15. 公開文書はdraftとし、一般公開前に本人確認・必要な法的レビューを行う。

## 変更できる場所

- template: `src/domain/scoring.ts`
- matching候補: `src/domain/companyMatching.ts`
- today action: `src/domain/watch.ts`
- runtime mode: `src/config/runtime.ts` と `.env.local`
- repository: `src/repositories/`
- AI schema: `src/domain/aiSync.ts`

## 仮定していないこと

Google実同期、Gmail自動監視、Web定期調査、OAuth verification、法的適合性、将来もGoogle APIが絶対無料であることは仮定していません。Phase 19でsource公開はユーザーが明示承認しましたが、個人データと認証情報は公開しません。
