# 🚀 Free Eight アカウント機能追加 実装計画書

**作成モデル**: Composer  
**作成日**: 2025年1月  
**対象**: Free Eight オンラインカードゲーム  
**目的**: 複数プレイヤーのアカウント登録・認証機能追加

---

## 📋 目次

1. [概要](#概要)
2. [現状分析](#現状分析)
3. [技術スタック選定](#技術スタック選定)
4. [ディレクトリ構造](#ディレクトリ構造)
5. [データベース設計](#データベース設計)
6. [実装フェーズ](#実装フェーズ)
7. [API設計](#api設計)
8. [セキュリティ考慮事項](#セキュリティ考慮事項)
9. [コスト見積もり](#コスト見積もり)
10. [リスクと対策](#リスクと対策)
11. [チェックリスト](#チェックリスト)

---

## 📊 概要

### 目標

- ユーザー名 + パスワードによるアカウント登録・認証機能を追加
- ゲーム履歴とスコアの永続化
- 非エンジニアでも保守しやすいディレクトリ構造に整理
- 既存のゲストモードとの互換性維持

### 前提条件

- 非エンジニアが保守可能なシンプルな構成
- コストとシンプルさを重視
- 既存機能への影響を最小限に

---

## 🔍 現状分析

### 現在の技術スタック

| 項目 | 現在 | 移行後 |
|-----|------|-------|
| **ホスティング** | Heroku | Render（推奨）またはHeroku継続 |
| **バックエンド** | Node.js + Express | 同じ |
| **リアルタイム通信** | Socket.IO | 同じ |
| **データベース** | なし（インメモリ） | PostgreSQL |
| **認証** | なし（LocalStorage ID） | JWT + ユーザー名/パスワード |
| **セッション管理** | インメモリ | JWT（トークンベース） |

### 現在のディレクトリ構造

```
mbv/
├── package.json
├── server.js              # 867行の単一ファイル
├── README.md
├── GAME_MANUAL.md
├── MIGRATION_PLAN.md
└── public/
    ├── index.html
    └── standalone.html
```

### 課題

- ❌ サーバー再起動でゲーム状態が消失
- ❌ ユーザーアカウント機能なし
- ❌ スコア履歴の永続化なし
- ❌ コードが単一ファイルに集約されていて保守が困難
- ❌ 認証機能がないため、ユーザー識別が不十分

---

## 🛠️ 技術スタック選定

### ホスティング

**推奨: Render**

| 項目 | Render | Heroku継続 |
|-----|--------|-----------|
| **無料枠** | 750時間/月 | なし（Eco: $7/月） |
| **PostgreSQL** | 90MB無料 | Mini: $5/月 |
| **WebSocket** | 対応 | 対応 |
| **自動デプロイ** | GitHub連携 | GitHub連携 |
| **月額コスト** | $0〜$14/月 | $12/月 |

**選択理由**: 無料枠があり、小規模運用から開始可能。Herokuと同様にシンプルな設定。

### データベース

**PostgreSQL + Prisma ORM**

- **Prisma選定理由**:
  - 型安全なクエリ
  - マイグレーション管理が簡単
  - Prisma StudioでGUIでDB確認可能（非エンジニア向け）
  - スキーマ定義が1ファイルで完結

### 認証方式

**ユーザー名 + パスワード + JWT**

- メールアドレス不要（シンプル）
- パスワードはbcryptでハッシュ化
- JWTでセッション管理
- ゲストモードとの互換性維持

---

## 📁 ディレクトリ構造

### 提案する新しい構造

```
mbv/
├── package.json
├── .env.example              # 環境変数テンプレート
├── .gitignore               # .envを除外
├── README.md
├── GAME_MANUAL.md
├── MIGRATION_PLAN.md
│
├── server.js                 # メインサーバー（簡潔化）
├── config/
│   └── database.js          # DB接続設定
│
├── routes/
│   ├── auth.js              # 認証API（登録・ログイン）
│   └── api.js               # その他API（将来拡張用）
│
├── middleware/
│   └── auth.js              # JWT認証ミドルウェア
│
├── utils/
│   ├── password.js          # パスワードハッシュ化
│   └── jwt.js               # JWT生成・検証
│
├── prisma/
│   ├── schema.prisma        # データベーススキーマ定義
│   └── migrations/          # マイグレーションファイル（自動生成）
│
└── public/
    ├── index.html
    ├── standalone.html
    └── js/
        ├── game.js          # ゲームロジック（将来分割）
        └── auth.js          # 認証UI（ログイン・登録フォーム）
```

### ディレクトリの役割

| ディレクトリ | 役割 | ファイル例 |
|------------|------|----------|
| `config/` | 設定ファイル | データベース接続設定 |
| `routes/` | APIエンドポイント | 認証、ゲームAPI |
| `middleware/` | ミドルウェア | JWT認証、エラーハンドリング |
| `utils/` | ユーティリティ関数 | パスワードハッシュ、JWT処理 |
| `prisma/` | データベース定義 | スキーマ、マイグレーション |
| `public/js/` | フロントエンドJS | ゲームロジック、認証UI |

---

## 🗄️ データベース設計

### Prismaスキーマ

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  username      String   @unique
  passwordHash  String
  displayName   String?
  totalScore    Int      @default(0)
  gamesPlayed   Int      @default(0)
  gamesWon      Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  lastLoginAt   DateTime?
  
  gameHistory   GameHistory[]
  
  @@map("users")
}

model GameHistory {
  id          String   @id @default(uuid())
  roomId      String
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  winnerId    String?
  winType     String?  // 'tsumo', 'ron', 'ron_gaeshi', 'draw'
  playerCount Int
  
  participants GameParticipant[]
  
  @@map("game_history")
}

model GameParticipant {
  id          String   @id @default(uuid())
  gameId      String
  userId      String
  scoreChange Int
  finalHand   String[] // JSON配列として保存
  seatNumber  Int
  
  game        GameHistory @relation(fields: [gameId], references: [id], onDelete: Cascade)
  user        User        @relation(fields: [userId], references: [id])
  
  @@map("game_participants")
}
```

### テーブル説明

| テーブル | 説明 | 主要カラム |
|--------|------|-----------|
| `users` | ユーザー情報 | username, passwordHash, totalScore |
| `game_history` | ゲーム履歴 | roomId, winnerId, winType |
| `game_participants` | 参加者情報 | userId, scoreChange, finalHand |

---

## 📅 実装フェーズ

### Phase 1: ディレクトリ構造の整理（1日）

**目標**: コードを機能ごとに分割し、保守性を向上

| タスク | 詳細 | 工数 |
|-------|------|------|
| ディレクトリ作成 | `config/`, `routes/`, `middleware/`, `utils/`, `prisma/` | 30分 |
| `server.js`簡潔化 | ルーティングを`routes/`に分離 | 2時間 |
| 既存機能の動作確認 | ゲーム機能が正常に動作することを確認 | 1時間 |

**成果物**: 機能ごとに分割されたコードベース

---

### Phase 2: データベース導入（2-3日）

**目標**: PostgreSQL接続とPrismaセットアップ

| タスク | 詳細 | 工数 |
|-------|------|------|
| Prismaインストール | `npm install prisma @prisma/client` | 10分 |
| スキーマ定義 | `prisma/schema.prisma`作成 | 2時間 |
| マイグレーション実行 | `npx prisma migrate dev` | 30分 |
| 接続テスト | ローカルDBで動作確認 | 1時間 |
| 環境変数設定 | `.env`ファイル作成 | 15分 |

**成果物**: データベース接続が確立され、テーブルが作成済み

---

### Phase 3: 認証機能実装（3-4日）

**目標**: ユーザー登録・ログイン機能

| タスク | 詳細 | 工数 |
|-------|------|------|
| パスワードユーティリティ | `utils/password.js`作成 | 1時間 |
| JWTユーティリティ | `utils/jwt.js`作成 | 1時間 |
| 認証ミドルウェア | `middleware/auth.js`作成 | 2時間 |
| 認証API | `routes/auth.js`作成 | 4時間 |
| フロントエンドUI | ログイン・登録フォーム | 3時間 |
| 統合テスト | 認証フロー全体のテスト | 2時間 |

**成果物**: ユーザー登録・ログインが動作する状態

---

### Phase 4: ゲーム状態の永続化（2-3日）

**目標**: ゲーム終了時にDBに履歴を保存

| タスク | 詳細 | 工数 |
|-------|------|------|
| ゲーム終了処理 | `server.js`にDB保存ロジック追加 | 3時間 |
| スコア更新 | ユーザースコアを更新 | 2時間 |
| 履歴表示API | 過去のゲーム履歴取得API | 2時間 |
| テスト | 永続化の動作確認 | 2時間 |

**成果物**: ゲーム履歴がDBに保存され、スコアが更新される

---

## 🔌 API設計

### 認証API

#### POST `/api/auth/register`

ユーザー登録

**リクエスト**:
```json
{
  "username": "player1",
  "password": "password123",
  "displayName": "プレイヤー1"
}
```

**レスポンス** (成功):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "player1",
    "displayName": "プレイヤー1"
  }
}
```

**レスポンス** (エラー):
```json
{
  "success": false,
  "error": "Username already exists"
}
```

#### POST `/api/auth/login`

ログイン

**リクエスト**:
```json
{
  "username": "player1",
  "password": "password123"
}
```

**レスポンス**: 登録APIと同様

#### GET `/api/auth/me`

現在のユーザー情報取得（認証必須）

**ヘッダー**:
```
Authorization: Bearer <JWT_TOKEN>
```

**レスポンス**:
```json
{
  "id": "uuid",
  "username": "player1",
  "displayName": "プレイヤー1",
  "totalScore": 150,
  "gamesPlayed": 10,
  "gamesWon": 3
}
```

### ゲーム履歴API（将来拡張）

#### GET `/api/games/history`

過去のゲーム履歴取得（認証必須）

**クエリパラメータ**:
- `limit`: 取得件数（デフォルト: 10）
- `offset`: オフセット（デフォルト: 0）

**レスポンス**:
```json
{
  "games": [
    {
      "id": "uuid",
      "roomId": "room123",
      "startedAt": "2025-01-01T10:00:00Z",
      "endedAt": "2025-01-01T10:15:00Z",
      "winType": "tsumo",
      "scoreChange": 30
    }
  ],
  "total": 10
}
```

---

## 🔒 セキュリティ考慮事項

### パスワード管理

- **ハッシュ化**: bcrypt（salt rounds: 10）
- **平文保存禁止**: パスワードは絶対に平文で保存しない
- **最小長**: 8文字以上を推奨（フロントエンドでバリデーション）

### JWT管理

- **有効期限**: 24時間
- **シークレットキー**: 環境変数で管理（`.env`）
- **HTTPS必須**: 本番環境ではHTTPS必須（Render/Herokuで自動対応）

### SQLインジェクション対策

- **Prisma使用**: Prismaが自動的にエスケープ処理
- **パラメータ化クエリ**: 直接SQLを書かない

### その他

- **レート制限**: 将来的に実装（例: express-rate-limit）
- **CORS設定**: 本番環境のドメインのみ許可
- **入力バリデーション**: フロントエンドとバックエンド両方で実施

---

## 💰 コスト見積もり

### Render（推奨）

| 項目 | 無料枠 | 有料プラン |
|-----|-------|-----------|
| **Webサービス** | 750時間/月 | $7/月（常時起動） |
| **PostgreSQL** | 90MB | $7/月（1GB） |
| **合計** | **$0/月** | **$14/月** |

**初期段階**: 無料枠で運用可能  
**成長後**: $14/月で安定運用

### Heroku継続

| 項目 | 費用 |
|-----|------|
| **Eco Dyno** | $7/月 |
| **Mini Postgres** | $5/月 |
| **合計** | **$12/月** |

---

## ⚠️ リスクと対策

### 技術的リスク

| リスク | 影響度 | 対策 |
|-------|-------|------|
| **DB接続エラー** | 高 | エラーハンドリングとリトライロジック |
| **JWT漏洩** | 中 | HTTPS必須、短期間有効期限 |
| **パスワード漏洩** | 高 | bcryptハッシュ化、平文保存禁止 |
| **既存機能の破壊** | 高 | 段階的実装、既存機能のテスト維持 |

### 運用リスク

| リスク | 影響度 | 対策 |
|-------|-------|------|
| **データベースバックアップ忘れ** | 高 | 自動バックアップ設定（Render/Heroku） |
| **環境変数漏洩** | 高 | `.env`を`.gitignore`に追加 |
| **デプロイ失敗** | 中 | ローカル環境での事前テスト |

### スケーラビリティ

| ユーザー数 | 必要な対策 |
|-----------|-----------|
| 〜100人 | 現在の構成で問題なし |
| 〜1,000人 | PostgreSQL接続最適化 |
| 〜5,000人 | Redis導入検討（セッション管理） |

---

## ✅ チェックリスト

### Phase 1: ディレクトリ構造整理

- [ ] 新しいディレクトリ構造を作成
- [ ] `server.js`を簡潔化（ルーティング分離）
- [ ] 既存のゲーム機能が正常に動作することを確認
- [ ] コードレビュー（構造の妥当性確認）

### Phase 2: データベース導入

- [ ] Prismaをインストール
- [ ] `prisma/schema.prisma`を作成
- [ ] マイグレーションを実行
- [ ] ローカルDBで接続テスト
- [ ] `.env`ファイルを設定
- [ ] Prisma Studioでテーブル確認

### Phase 3: 認証機能実装

- [ ] `utils/password.js`を作成（bcrypt）
- [ ] `utils/jwt.js`を作成（JWT生成・検証）
- [ ] `middleware/auth.js`を作成（認証ミドルウェア）
- [ ] `routes/auth.js`を作成（登録・ログインAPI）
- [ ] フロントエンドにログインフォーム追加
- [ ] フロントエンドに登録フォーム追加
- [ ] 認証フロー全体をテスト
- [ ] ゲストモードとの互換性確認

### Phase 4: ゲーム状態永続化

- [ ] ゲーム終了時にDB保存処理を追加
- [ ] ユーザースコア更新処理を追加
- [ ] ゲーム履歴取得APIを実装（オプション）
- [ ] 永続化の動作確認
- [ ] サーバー再起動後のデータ保持確認

### 最終確認

- [ ] すべての機能が正常に動作
- [ ] セキュリティチェック（パスワードハッシュ化、JWT）
- [ ] エラーハンドリングの確認
- [ ] パフォーマンステスト（DB接続数など）
- [ ] ドキュメント更新（README.md）

---

## 📝 環境変数

### `.env.example`

```env
# データベース
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# JWT
JWT_SECRET="your-super-secret-key-change-in-production"

# 環境
NODE_ENV="development"
PORT=3000
```

### 設定手順

1. `.env.example`をコピーして`.env`を作成
2. 各値を実際の値に置き換え
3. `.env`を`.gitignore`に追加（既に追加済み）

---

## 🔄 既存機能との互換性

### ゲストモード維持

既存のゲストモード（LocalStorage ID）は引き続き動作する。

**実装方針**:
- Socket.IO接続時に、JWTトークンがあれば認証ユーザー、なければゲストとして扱う
- ゲストユーザーはDBに保存されないが、ゲームはプレイ可能

### 段階的移行

1. **Phase 1-2**: 既存機能に影響なし（DB追加のみ）
2. **Phase 3**: 認証機能追加、ゲストモードは継続
3. **Phase 4**: 認証ユーザーのみ履歴保存、ゲストは従来通り

---

## 📚 参考資料

### Prisma

- [Prisma公式ドキュメント](https://www.prisma.io/docs)
- [Prisma Studio](https://www.prisma.io/studio) - GUIでDB確認

### JWT

- [JWT.io](https://jwt.io/) - JWTデバッグツール
- [jsonwebtoken npm](https://www.npmjs.com/package/jsonwebtoken)

### Render

- [Render公式ドキュメント](https://render.com/docs)
- [PostgreSQL on Render](https://render.com/docs/databases)

---

## 📞 サポート

### 問題が発生した場合

1. **ローカル環境での確認**: `npm run dev`で動作確認
2. **Prisma Studio**: `npx prisma studio`でDB内容確認
3. **ログ確認**: Render/Herokuのログを確認
4. **エラーメッセージ**: エラーメッセージを記録して調査

---

**作成モデル**: Composer  
**最終更新**: 2025年1月  
**バージョン**: 1.0


