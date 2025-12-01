# Phase 0: Railwayデプロイ - タスクプロンプト

## 概要

Free Eight（オンラインカードゲーム）をRailwayにデプロイし、外部公開でテストできる状態にする。

---

## プロジェクト背景

- **Free Eight**: Socket.IOを使用したリアルタイムマルチプレイヤーカードゲーム
- **現状**: ローカル環境でのみ動作
- **目標**: Railwayにデプロイし、外部ユーザーとテスト可能にする

---

## 参照ドキュメント

実装前に以下を確認してください：

| ドキュメント | 内容 |
|------------|------|
| `docs/plans/TASK_LIST.md` | タスクリスト（進捗管理） |
| `docs/plans/実装計画書/移行計画書` | 詳細な実装計画 |
| `.cursor/rules/implementation-workflow.mdc` | 実装ワークフロールール |

---

## 実行するタスク

`TASK_LIST.md` の Phase 0 セクションを参照：

- [ ] **0-1**. Railway アカウント作成
- [ ] **0-2**. GitHub連携設定
- [ ] **0-3**. リポジトリ接続（自動デプロイ設定）
- [ ] **0-4**. 環境変数設定（`PORT`, `NODE_ENV`）
- [ ] **0-5**. 動作確認
  - WebSocket接続テスト
  - 複数ブラウザ/端末で同じルームに入室
  - 対戦が正常に動作することを確認

---

## 技術的な補足

### プロジェクト構成

```
Free Eight/
├── server/index.js      # Express + Socket.IO サーバー（ポート3000）
├── public/html/         # 静的ファイル（index.html）
├── package.json         # npm start でサーバー起動
└── node_modules/        # 依存関係（インストール済み）
```

### 必要な環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `PORT` | 3000（またはRailwayが自動設定） | サーバーポート |
| `NODE_ENV` | production | 本番環境フラグ |

### ローカルでの動作確認方法

```bash
npm start
# http://localhost:3000 でアクセス
```

---

## 作業開始手順

### 1. ブランチ作成

```bash
cd "/Users/itoken/Free Eight"
git checkout main
git pull origin main
git checkout -b feature/phase-0-railway-deploy
```

### 2. タスク実行

各タスクを順番に実行し、完了したら `TASK_LIST.md` のチェックボックスを更新。

### 3. 完了時

```bash
# 変更をコミット
git add -A
git commit -m "chore: Phase 0 Railwayデプロイ完了

- Railway環境構築
- 環境変数設定
- 動作確認完了"

# mainにマージ
git checkout main
git merge feature/phase-0-railway-deploy
git push origin main
```

---

## 完了条件

- [ ] Railway上のURLからゲーム画面にアクセスできる
- [ ] 複数ブラウザで同じルームに入室し、対戦できる
- [ ] Socket.IOのエラーがログに出ていない
- [ ] `TASK_LIST.md` のPhase 0が全てチェック済み

---

## 想定所要時間

**0.5日（約4時間）**

---

## 困ったときは

- Railway公式ドキュメント: https://docs.railway.app/
- Socket.IO + Railway: WebSocketはRailwayでネイティブサポート
- 問題が発生した場合は、エラーログを確認してから相談

