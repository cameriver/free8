# 🚀 Free Eight Railway移行計画書

> **重要**: この文書は 2024 年時点の Railway 移行計画の記録です。  
> 最新の統合的な実装・移行計画は `docs/plans/実装計画書/移行計画書`（**Free Eight アカウント機能 統合実装計画書**）を参照してください。  
> 本ファイルはインフラ移行（Railway + PostgreSQL）の背景資料として保存しています。

**作成日**: 2024年  
**対象**: Free Eight オンラインカードゲーム  
**移行先**: Railway + PostgreSQL

---

## 📋 目次

1. [現状分析](#現状分析)
2. [移行フェーズ](#移行フェーズ)
3. [技術的変更点](#技術的変更点)
4. [デメリットとリスク](#デメリットとリスク)
5. [将来起きうる問題](#将来起きうる問題)
6. [コスト試算](#コスト試算)
7. [代替案](#代替案)

---

## 📊 現状分析

### 現在の技術スタック

| 項目 | 現在 | 移行後 |
|-----|------|-------|
| **ホスティング** | Heroku / Vercel（未動作） | Railway |
| **バックエンド** | Node.js + Express | 同じ |
| **リアルタイム通信** | Socket.IO | 同じ |
| **データベース** | なし（インメモリ） | PostgreSQL |
| **認証** | なし（LocalStorage ID） | JWT + Passport.js |
| **セッション管理** | インメモリ | PostgreSQL / Redis |

### 現在のデータフロー

```
クライアント (LocalStorage: clientId)
    ↓ WebSocket
サーバー (インメモリ: rooms Map)
    ↓
ゲーム状態管理（揮発性）
```

### 課題

- ❌ サーバー再起動でゲーム状態が消失
- ❌ ユーザーアカウント機能なし
- ❌ スコア履歴の永続化なし
- ❌ 複数サーバーインスタンスに対応不可

---

## 📅 移行フェーズ

### Phase 1: 基本移行（1-2日）

**目標**: 現在のアプリをRailwayで動作させる

| タスク | 詳細 | 工数 |
|-------|------|------|
| Railway アカウント作成 | GitHub連携 | 10分 |
| リポジトリ接続 | 自動デプロイ設定 | 15分 |
| 環境変数設定 | `PORT`, `NODE_ENV` | 10分 |
| 動作確認 | WebSocket接続テスト | 30分 |
| ドメイン設定 | カスタムドメイン（オプション） | 20分 |

**成果物**: `https://free-eight.up.railway.app` のような公開URL

---

### Phase 2: データベース導入（3-5日）

**目標**: PostgreSQLでユーザー・スコア管理

#### 2.1 データベース設計

```sql
-- ユーザーテーブル
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  total_score INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0
);

-- 対戦履歴テーブル
CREATE TABLE game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id VARCHAR(50) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  winner_id UUID REFERENCES users(id),
  win_type VARCHAR(20), -- 'tsumo', 'ron', 'ron_gaeshi', 'draw'
  player_count INTEGER
);

-- 対戦参加者テーブル
CREATE TABLE game_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES game_history(id),
  user_id UUID REFERENCES users(id),
  score_change INTEGER,
  final_hand TEXT[], -- 終了時の手札
  seat_number INTEGER
);

-- セッションテーブル（オプション）
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2.2 追加パッケージ

```json
{
  "dependencies": {
    "pg": "^8.11.0",
    "prisma": "^5.0.0",
    "@prisma/client": "^5.0.0",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "passport-local": "^1.0.0"
  }
}
```

---

### Phase 3: 認証システム（3-5日）

**目標**: ユーザー登録・ログイン機能

| 機能 | 実装内容 |
|-----|---------|
| 登録 | メール + パスワード |
| ログイン | JWT発行 |
| ゲスト | 従来のLocalStorage ID（互換性維持） |
| パスワードリセット | メール送信（Phase 4） |

#### API エンドポイント

```
POST /api/auth/register    - ユーザー登録
POST /api/auth/login       - ログイン
POST /api/auth/logout      - ログアウト
GET  /api/auth/me          - 現在のユーザー情報
PUT  /api/auth/profile     - プロフィール更新
```

---

### Phase 4: 追加機能（5-10日）

| 機能 | 優先度 | 工数 |
|-----|-------|------|
| ランキングシステム | 高 | 2日 |
| フレンド機能 | 中 | 3日 |
| 招待リンク | 高 | 1日 |
| 観戦モード | 低 | 3日 |
| リプレイ機能 | 低 | 5日 |
| メール通知 | 中 | 2日 |

---

## 🔧 技術的変更点

### server.js の変更箇所

```javascript
// 追加が必要なもの
const { PrismaClient } = require('@prisma/client');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// 認証ミドルウェア
const authenticateJWT = passport.authenticate('jwt', { session: false });

// Socket.IO認証
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.userId = decoded.id;
      next();
    });
  } else {
    // ゲストモード（従来互換）
    socket.guestId = socket.handshake.auth.clientId;
    next();
  }
});
```

### 環境変数

```env
# Railway で設定
DATABASE_URL=postgresql://...
JWT_SECRET=your-super-secret-key
NODE_ENV=production
PORT=3000

# オプション
REDIS_URL=redis://...
SMTP_HOST=smtp.example.com
SMTP_USER=...
SMTP_PASS=...
```

---

## ⚠️ デメリットとリスク

### 1. コスト増加

| 項目 | Heroku (現在) | Railway (移行後) |
|-----|--------------|-----------------|
| サーバー | $7/月 (Eco) | $5〜/月 (使用量) |
| DB | $5/月 (Mini) | $5〜/月 (使用量) |
| **合計** | **$12/月〜** | **$10〜20/月** |

> ⚠️ ユーザー増加に伴いコストが線形に増加

### 2. 移行に伴うダウンタイム

- DNS切り替え時に数分〜数時間のダウンタイム発生の可能性
- 既存ユーザーのセッションが切断される

### 3. 学習コスト

- Prisma ORM の習得
- JWT認証の実装
- PostgreSQL の運用知識

### 4. 複雑性の増加

```
現在:  server.js (867行) + index.html
   ↓
移行後: server.js + auth.js + db.js + models/ + migrations/ + ...
```

### 5. デバッグ難易度の上昇

- ローカルとプロダクションでDB環境が異なる
- WebSocket + DB + 認証の組み合わせによるバグ特定の困難化

---

## 🔮 将来起きうる問題

### 短期（3-6ヶ月）

| 問題 | 影響度 | 対策 |
|-----|-------|------|
| **DB接続プール枯渇** | 高 | 接続数制限・PgBouncer導入 |
| **WebSocket同時接続上限** | 高 | Railway Proプラン検討 |
| **JWT漏洩** | 高 | リフレッシュトークン実装 |
| **データベースバックアップ忘れ** | 高 | 自動バックアップ設定 |

### 中期（6-12ヶ月）

| 問題 | 影響度 | 対策 |
|-----|-------|------|
| **単一サーバーボトルネック** | 中 | Socket.IO Redis Adapter |
| **DBスロークエリ** | 中 | インデックス最適化 |
| **セッションハイジャック** | 中 | IP制限・デバイス認証 |
| **スパムアカウント** | 中 | CAPTCHA・メール認証 |

### 長期（1年以上）

| 問題 | 影響度 | 対策 |
|-----|-------|------|
| **水平スケーリング限界** | 高 | マイクロサービス化検討 |
| **Railway価格改定** | 中 | マルチクラウド対応 |
| **Socket.IO非対応変更** | 低 | 代替技術の調査 |
| **GDPR/個人情報保護法** | 高 | データ削除機能実装 |
| **不正行為・チート** | 高 | サーバーサイドバリデーション強化 |

### スケーラビリティの壁

```
ユーザー数と必要な対策:

〜100人:   現在の構成で問題なし
〜1,000人: PostgreSQL接続最適化
〜5,000人: Redis導入（セッション・キャッシュ）
〜10,000人: 複数サーバー + ロードバランサー
〜50,000人: マイクロサービス化検討
```

---

## 💰 コスト試算

### 初期費用

| 項目 | 費用 |
|-----|------|
| Railway セットアップ | $0 |
| ドメイン取得（オプション） | $10-15/年 |
| SSL証明書 | $0 (Railway提供) |

### 月額費用（予測）

| ユーザー規模 | Railway | DB | 合計 |
|------------|---------|-----|------|
| 〜100人 | $5 | $5 | **$10/月** |
| 〜500人 | $10 | $10 | **$20/月** |
| 〜2,000人 | $20 | $20 | **$40/月** |
| 〜10,000人 | $50+ | $50+ | **$100+/月** |

---

## 🔄 代替案

### 案A: Render（推奨度: ★★★★☆）

**メリット**:
- 無料枠が充実（750時間/月）
- PostgreSQL無料プランあり

**デメリット**:
- 無料枠は15分でスリープ
- WebSocket無料枠の制限

### 案B: Fly.io（推奨度: ★★★★☆）

**メリット**:
- グローバル分散デプロイ
- 低レイテンシー

**デメリット**:
- 設定がやや複雑
- 日本リージョンなし（東京近辺は香港）

### 案C: 自前VPS (DigitalOcean/Vultr)（推奨度: ★★★☆☆）

**メリット**:
- 完全な制御
- 固定費用（$5-20/月）

**デメリット**:
- 運用負荷が高い
- セキュリティ管理が必要

### 案D: AWS/GCP（推奨度: ★★☆☆☆）

**メリット**:
- エンタープライズグレード
- 無限のスケーラビリティ

**デメリット**:
- 設定が複雑
- 小規模では割高
- 学習コスト高

---

## ✅ 推奨アクション

### 即座に実行

1. **Railway無料アカウント作成** → デプロイテスト
2. **現在のコードをそのままデプロイ** → 動作確認
3. **Herokuとの並行運用** → 安全な移行

### 1ヶ月以内

4. **PostgreSQL追加** → スキーマ設計
5. **認証システム実装** → 段階的リリース

### 3ヶ月以内

6. **本番切り替え** → DNS変更
7. **Heroku停止** → コスト削減

---

## 📝 チェックリスト

### Phase 1 完了条件

- [ ] Railway でサーバー起動確認
- [ ] WebSocket接続成功
- [ ] 複数ブラウザで対戦可能
- [ ] 公開URLでアクセス可能

### Phase 2 完了条件

- [ ] PostgreSQL接続成功
- [ ] ユーザーテーブル作成
- [ ] 対戦履歴保存動作
- [ ] バックアップ設定完了

### Phase 3 完了条件

- [ ] ユーザー登録機能
- [ ] ログイン/ログアウト
- [ ] JWT認証動作
- [ ] ゲストモード互換性維持

---

## 📞 緊急時対応

### Railway障害時

1. Heroku（バックアップ）に切り替え
2. Status Page確認: https://status.railway.app
3. Discord サポート: https://discord.gg/railway

### データベース障害時

1. 最新バックアップから復元
2. Railway ダッシュボードからリストア
3. 最悪の場合：インメモリモードで一時運用

---

**作成者**: AI Assistant  
**最終更新**: 2024年


