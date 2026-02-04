# URL動的設定のセットアップ手順

ConfigシートのH10セルからAPIのURLを自動的に読み取る機能を実装しました。

## 仕組み

1. **スプレッドシート側（GAS）**
   - `Config`シートのH10セルに保存されたURLを読み取る
   - APIレスポンスに`apiUrl`として含める

2. **フロントエンド側**
   - 初回アクセス時は`config.js`のURLを使用
   - APIレスポンスから新しいURLを取得
   - `localStorage`に保存して次回以降使用
   - URLが変更されても自動的に最新のURLに更新

## セットアップ手順

### 1. ConfigシートにURLを設定（既に完了済み）
- ✅ スプレッドシートの「Config」シート H10セルにデプロイURLが設定済み

### 2. config.jsの初期設定

初回のみ、`js/config.js`に現在のデプロイURLを設定してください：

```javascript
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/【現在のデプロイID】/exec',
  // ...
};
```

**重要**: 2回目以降のアクセスでは、ConfigシートのH10セルの値が優先されます。

### 3. GASスクリプトを更新してデプロイ

1. Apps Scriptエディタで更新された `Code.gs` をコピー＆ペースト
2. 保存（Ctrl + S）
3. 「デプロイ」→「デプロイを管理」
4. 既存のデプロイの編集アイコンをクリック
5. 「バージョン」を「新バージョン」に変更
6. 「デプロイ」をクリック

**注意**: URLは変わりません。同じURLで新しいバージョンが動作します。

### 4. 動作確認

1. ブラウザで`index.html`を開く
2. 開発者ツール（F12）のConsoleタブを開く
3. 以下のログが表示されることを確認：
   ```
   Updating API URL from response: https://script.google.com/macros/s/.../exec
   ```

## URL変更時の手順

将来的にGASのURLが変更になった場合：

1. **ConfigシートのH10セルを更新**
   - 新しいデプロイURLをH10セルに入力

2. **それだけです！**
   - フロントエンド側は自動的に新しいURLを検出して使用します
   - `config.js`を編集する必要はありません

## トラブルシューティング

### URLが更新されない

1. **ConfigシートでH10セルの値を確認**
   - 正しいURLが入力されているか
   - 前後にスペースが入っていないか

2. **ブラウザのキャッシュをクリア**
   ```javascript
   // 開発者ツールのConsoleで実行
   localStorage.removeItem('OSG_API_URL');
   location.reload();
   ```

3. **GASのログを確認**
   - Apps Scriptエディタで「実行ログ」を開く
   - `getApiUrl`関数でエラーが発生していないか確認

### ConfigシートH10セルの値をテスト

Apps Scriptエディタで以下を実行：

```javascript
function testGetApiUrl() {
  const url = getApiUrl();
  Logger.log('API URL from Config sheet: ' + url);
}
```

## 利点

- ✅ URL変更時にコードを編集する必要がない
- ✅ スプレッドシート上で一元管理
- ✅ 自動的に最新URLに更新
- ✅ 複数のユーザーが同時に使用しても問題なし
