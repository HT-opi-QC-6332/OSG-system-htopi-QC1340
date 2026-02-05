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
    REQUEST_TIMEOUT: 60000,        // リクエストタイムアウト: 60秒

    // 共通変換テーブル
    WORKPLACE_NAME_MAP: {
        'P': 'プレス',
        'A': '部品組立',
        'C': 'キャブ組立',
        'H': '補給',
        'AC': '組立全般',
        'PH': 'プレス/補給',
        'all': '全般'
    },

    ROLE_NAME_MAP: {
        'admin': '管理者',
        'manufacturing_editor': '製造編集者',
        'quality_editor': '品質編集者',
        'viewer': '閲覧者'
    }
};
