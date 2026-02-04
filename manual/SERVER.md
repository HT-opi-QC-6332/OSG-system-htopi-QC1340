# ローカルWebサーバーの起動方法

CORSエラーを回避し、スプレッドシートのデータを正しく表示するために、ローカルWebサーバーを使用してアプリケーションを実行します。

## 方法1: Visual Studio Code の Live Server 拡張機能（最も推奨・無料）

VS Codeを使用している場合、これが最も簡単でボタン一つで起動できます。

### 1. 拡張機能のインストール
1. VS Codeの左端にある **四角いアイコン（拡張機能）** をクリックします。
2. 検索窓に `Live Server` と入力します。
3. **Ritwick Dey** 氏が作成した「Live Server」の「インストール」ボタンをクリックします。

### 2. サーバーの起動
1. 左側のファイルエクスプローラーで [index.html](file:///c:/Users/PCWS90U/OneDrive/%E4%BB%95%E4%BA%8B%E7%94%A8/O.S.G-app_%E9%96%8B%E7%99%BA/OSG-app/index.html) を開きます。
2. 画面右下のステータスバーにある **「Go Live」** という文字をクリックします。
3. または、`index.html` を右クリックして 「Open with Live Server」 を選択します。

### 3. ブラウザでの確認
1. 自動的にブラウザが立ち上がり、`http://127.0.0.1:5500/index.html` が開きます。
2. 「データを読み込み中...」の表示のあと、スプレッドシートのデータが表示されれば成功です！

---

## 方法2: Pythonを使用（完全無料）

VS Codeが使えない環境などで使用します。

#### インストールされているか調べる方法
1. **コマンドプロンプト**（黒い画面）を開きます。
2. `python --version` または `py --version` と入力して Enter を押してください。

#### 起動手順
1. OSG-appディレクトリに移動:
   ```powershell
   cd "C:\Users\PCWS90U\OneDrive\仕事用\O.S.G-app_開発\OSG-app"
   ```
2. Webサーバーを起動:
   ```powershell
   python -m http.server 8000
   ```
3. ブラウザでアクセス: `http://localhost:8000`

---

## サーバー起動後の確認手順

1. 起動したブラウザで **F12キー** を押して開発者ツールを開きます。
2. **Console** タブを選択し、エラー（赤文字）が出ていないか確認します。
3. `Fetched 5692 records` というログがあれば正常に通信できています。

---

## トラブルシューティング

### "python: コマンドが見つかりません"

Pythonがインストールされていません。以下のいずれかを実行：
- Pythonをインストール: https://www.python.org/downloads/
- Node.jsを使用する方法に切り替え

### ポート8000が使用中

別のポート番号を使用：
```powershell
python -m http.server 8080
# または
http-server -p 8080
```

ブラウザで `http://localhost:8080` にアクセス

### それでもCORSエラーが出る場合

GASのデプロイ設定を確認：
1. Apps Scriptエディタで「デプロイ」→「デプロイを管理」
2. 「アクセスできるユーザー」が正しく設定されているか確認
   - テスト段階: 「自分のみ」
   - 本番環境: 「全員」

---

## サーバーの停止方法

コマンドプロンプト/PowerShellで `Ctrl + C` を押す
