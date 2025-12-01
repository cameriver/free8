# 🎮 Free Eight 実装タスクリスト

**作成日**: 2025年12月  
**ベース**: 移行計画書（実装計画書/移行計画書）  
**目的**: タスク単位で進捗を管理し、漏れなく実装を進める

---

## 進捗サマリー

| Phase | 状態 | タスク数 | 完了数 |
|-------|------|---------|-------|
| Phase 0: Railwayデプロイ | 🔴 未着手 | 5 | 0 |
| Phase 1: コード分割 | 🔴 未着手 | 14 | 0 |
| Phase 2: データベース導入 | 🔴 未着手 | 8 | 0 |
| Phase 3: 認証機能実装 | 🔴 未着手 | 13 | 0 |
| Phase 4: ゲーム状態永続化 | 🔴 未着手 | 9 | 0 |

**凡例**: 🔴 未着手 / 🟡 進行中 / 🟢 完了

---

## Phase 0: Railwayデプロイ（0.5日）

**目標**: コード変更を最小限にして、今のゲームをRailway上で安定して動かす

- [ ] **0-1**. Railway アカウント作成
- [ ] **0-2**. GitHub連携設定
- [ ] **0-3**. リポジトリ接続（自動デプロイ設定）
- [ ] **0-4**. 環境変数設定（`PORT`, `NODE_ENV`）
- [ ] **0-5**. 動作確認
  - [ ] WebSocket接続テスト
  - [ ] 複数ブラウザ/端末で同じルームに入室
  - [ ] 対戦が正常に動作することを確認

**完了条件**:
- Railway上のURLからゲーム画面にアクセスできる
- Socket.IOのエラーがログに出ていない

---

## Phase 1: コード分割（2-3日）

**目標**: 現在の `server.js` を保守しやすい構造に分割

### ディレクトリ作成
- [ ] **1-1**. `src/` ディレクトリ作成
- [ ] **1-2**. `src/game/` ディレクトリ作成
- [ ] **1-3**. `src/socket/` ディレクトリ作成
- [ ] **1-4**. `src/config/` ディレクトリ作成

### ゲームロジック分離（純粋関数）
- [ ] **1-5**. `src/game/deck.js` 作成
  - `createDeck()`, `shuffle()`
- [ ] **1-6**. `src/game/cards.js` 作成
  - `getCardInfo()`, `getCardPoints()`, `calculateHandPoints()`, `calculateHandValue()`, `getCardValue()`
- [ ] **1-7**. `src/game/rules.js` 作成
  - `canPlayCard()`, `getCardEffect()`
- [ ] **1-8**. `src/game/room.js` 作成
  - `createRoom()`, `getRoom()`, `dealCards()`
- [ ] **1-9**. `src/game/scoring.js` 作成
  - `checkRonPossible()`, `checkRonGaeshi()`, `handleTsumo()`, `handleRon()`, `handleDeckEmpty()`

### Socket処理分離
- [ ] **1-10**. `src/socket/room-handlers.js` 作成
  - `joinRoom`, `requestStart`, `requestRestart` イベント
- [ ] **1-11**. `src/socket/game-handlers.js` 作成
  - `move`, `ronTimeout` イベント

### エントリーポイント
- [ ] **1-12**. `src/index.js` & `src/app.js` 作成
- [ ] **1-13**. 動作確認（既存機能が正常動作することを確認）
- [ ] **1-14**. Railwayで再デプロイ・動作確認

**完了条件**:
- 分割後も現在と同じ動作をする
- ローカルとRailway両方で動作確認済み

---

## Phase 2: データベース導入（2-3日）

**目標**: PostgreSQL接続とPrismaセットアップ

### セットアップ
- [ ] **2-1**. Prismaインストール
  - `npm install prisma @prisma/client`
- [ ] **2-2**. `prisma/schema.prisma` 作成
  - User, GameHistory, GameParticipant モデル定義
- [ ] **2-3**. `.env.example` 作成
- [ ] **2-4**. `.gitignore` に `.env` 追加

### Railway PostgreSQL
- [ ] **2-5**. Railway ダッシュボードからPostgreSQL追加
- [ ] **2-6**. `DATABASE_URL` 環境変数設定（ローカル & Railway）
- [ ] **2-7**. マイグレーション実行
  - `npx prisma migrate dev --name init`
- [ ] **2-8**. Prisma Studio でテーブル確認
  - `npx prisma studio`

**完了条件**:
- データベース接続が確立
- テーブルが正しく作成されている

---

## Phase 3: 認証機能実装（3-4日）

**目標**: ユーザー登録・ログイン機能

### ユーティリティ
- [ ] **3-1**. `src/utils/password.js` 作成
  - `hashPassword()`, `verifyPassword()` (bcrypt)
- [ ] **3-2**. `src/utils/token.js` 作成
  - `generateToken()`, `verifyToken()` (JWT)

### ミドルウェア
- [ ] **3-3**. `src/middleware/jwt.js` 作成

### 認証API
- [ ] **3-4**. `src/routes/auth.js` 作成
- [ ] **3-5**. `POST /api/auth/register` 実装
- [ ] **3-6**. `POST /api/auth/login` 実装
- [ ] **3-7**. `GET /api/auth/me` 実装

### フロントエンド
- [ ] **3-8**. ログインフォームUI追加
- [ ] **3-9**. 登録フォームUI追加
- [ ] **3-10**. JWT保存・送信処理

### 統合
- [ ] **3-11**. Socket.IO認証連携（JWTでユーザー識別）
- [ ] **3-12**. ゲストモードとの互換性確認
- [ ] **3-13**. 認証フロー全体のテスト

**完了条件**:
- ユーザー登録・ログインが動作する
- ログインなしでもゲストとしてプレイ可能

---

## Phase 4: ゲーム状態の永続化（2-3日）

**目標**: ゲーム終了時にDBに履歴を保存

### DB操作モジュール
- [ ] **4-1**. `src/db/users.js` 作成
- [ ] **4-2**. `src/db/games.js` 作成

### ゲーム終了時の保存
- [ ] **4-3**. `scoring.js` にDB保存ロジック追加
- [ ] **4-4**. ユーザースコア更新処理（`totalScore`, `gamesPlayed`, `gamesWon`）

### 履歴API
- [ ] **4-5**. `GET /api/games/history` 実装
- [ ] **4-6**. `GET /api/games/ranking` 実装（オプション）

### フロントエンド
- [ ] **4-7**. 過去のゲーム履歴一覧表示

### 最終確認
- [ ] **4-8**. 永続化の動作確認
- [ ] **4-9**. サーバー再起動後のデータ保持確認

**完了条件**:
- ゲーム履歴がDBに保存される
- ユーザースコアが更新される
- サーバー再起動してもデータが残る

---

## 最終チェックリスト

- [ ] すべての機能が正常に動作
- [ ] セキュリティチェック
  - [ ] パスワードがハッシュ化されている
  - [ ] JWTが正しく検証されている
  - [ ] HTTPSが有効
- [ ] エラーハンドリングの確認
- [ ] README.md 更新
- [ ] 移行計画書との整合性確認

---

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2025-12-01 | 初版作成 |

