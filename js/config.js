/**
 * OSG - API設定ファイル
 * Google Apps ScriptのデプロイURLを設定します
 */

const CONFIG = {
    // GAS Web AppのデプロイURL
    // デプロイ後、以下の形式のURLに置き換えてください:
    // 'https://script.google.com/macros/s/【デプロイID】/exec'
    GAS_URL: 'https://script.google.com/macros/s/AKfycbyehXeW47Ef1FJkuUoFMcERohszJbL_MWaCylOvK50nYvhNJpVyVArJAE-8uUPDp95pmw/exec',

    // その他の設定
    CACHE_DURATION: 5 * 60 * 1000, // キャッシュ有効期間: 5分
    REQUEST_TIMEOUT: 30000,        // リクエストタイムアウト: 30秒
};
