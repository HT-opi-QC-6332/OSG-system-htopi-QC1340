/**
 * OSG - API通信モジュール
 * Google Spreadsheetからデータを取得する機能
 */

// 初期化: localStorageに保存されたURLがあれば使用
(function initializeApiUrl() {
    // デフォルトURLを保持（フォールバック用）
    CONFIG.DEFAULT_GAS_URL = CONFIG.GAS_URL;

    try {
        const savedUrl = localStorage.getItem('OSG_API_URL');
        if (savedUrl && savedUrl !== 'YOUR_GAS_DEPLOYMENT_URL_HERE' && savedUrl !== CONFIG.GAS_URL) {
            console.log('Loading saved API URL from localStorage');
            CONFIG.GAS_URL = savedUrl;
        }
    } catch (e) {
        console.warn('Failed to load URL from localStorage:', e);
    }
})();

// データキャッシュ
let cachedData = null;
let cacheTimestamp = null;

/**
 * スプレッドシートからデータを取得
 * @param {boolean} forceRefresh - キャッシュを無視して強制的に再取得
 * @return {Promise<Array>} シフトデータの配列
 */
async function fetchShiftData(forceRefresh = false) {
    // キャッシュチェック (userSettingsも含めてキャッシュが必要だが、簡易的にデータがあればOKとする)
    // 構造変更: cachedData = { data: [], userSettings: {} }
    if (!forceRefresh && cachedData && cacheTimestamp) {
        const now = Date.now();
        if (now - cacheTimestamp < CONFIG.CACHE_DURATION) {
            console.log('Using cached data');
            return cachedData;
        }
    }

    try {
        console.log('Fetching data from GAS...');

        // タイムアウト付きでfetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        // URLにパラメータ追加 (userId)
        const buildFetchUrl = (baseUrl) => {
            let url = baseUrl;
            if (typeof Auth !== 'undefined') {
                const user = Auth.getUser();
                if (user && user.id) {
                    const separator = url.includes('?') ? '&' : '?';
                    url = `${url}${separator}action=getData&userId=${encodeURIComponent(user.id)}`;
                }
            }
            return url;
        };

        let fetchUrl = buildFetchUrl(CONFIG.GAS_URL);

        let response;
        try {
            response = await fetch(fetchUrl, {
                method: 'GET',
                signal: controller.signal
            });
        } catch (initialError) {
            // 最初のトライで失敗、かつ現在のURLがデフォルトと異なる場合はデフォルトでリトライ
            if (CONFIG.GAS_URL !== CONFIG.DEFAULT_GAS_URL) {
                console.warn('Fetch with stored URL failed, retrying with DEFAULT_GAS_URL:', initialError);
                CONFIG.GAS_URL = CONFIG.DEFAULT_GAS_URL; // URLをリセット
                localStorage.removeItem('OSG_API_URL'); // 不正なキャッシュを削除

                fetchUrl = buildFetchUrl(CONFIG.GAS_URL);
                response = await fetch(fetchUrl, {
                    method: 'GET',
                    signal: controller.signal
                });
            } else {
                throw initialError; // デフォルトでもダメならエラー
            }
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        // エラーレスポンスのチェック
        if (result.error) {
            throw new Error(result.error);
        }

        // データの検証
        if (!result.data || !Array.isArray(result.data)) {
            throw new Error('Invalid data format received from server');
        }

        // APIレスポンスに含まれるURLを次回以降使用するために更新
        if (result.apiUrl && result.apiUrl !== CONFIG.GAS_URL) {
            console.log('Updating API URL from response:', result.apiUrl);
            CONFIG.GAS_URL = result.apiUrl;
            // localStorageに保存して永続化
            try {
                localStorage.setItem('OSG_API_URL', result.apiUrl);
            } catch (e) {
                console.warn('Failed to save URL to localStorage:', e);
            }
        }

        console.log(`Fetched ${result.count || result.data.length} records`);

        // 返却オブジェクト作成
        const returnData = {
            data: result.data,
            userSettings: result.userSettings || null
        };

        // キャッシュに保存
        cachedData = returnData;
        cacheTimestamp = Date.now();

        return returnData;

    } catch (error) {
        console.error('Failed to fetch data:', error);

        // ネットワークエラーの場合、キャッシュがあれば返す
        if (error.name === 'AbortError') {
            console.warn('Request timed out');
            if (cachedData) {
                console.log('Returning cached data due to timeout');
                return cachedData;
            }
        }

        throw error;
    }
}

/**
 * データをリフレッシュ（キャッシュをクリアして再取得）
 * @return {Promise<Array>} シフトデータの配列
 */
async function refreshData() {
    cachedData = null;
    cacheTimestamp = null;
    return await fetchShiftData(true);
}

/**
 * キャッシュをクリア
 */
function clearCache() {
    cachedData = null;
    cacheTimestamp = null;
    console.log('Cache cleared');
}

/**
 * Update shift data
 * @param {Object} updateData - Data to update { id, section, ...fields }
 * @return {Promise<Object>} Result
 */
async function updateShiftData(updateData) {
    try {
        console.log('Updating data:', updateData);
        const formData = new URLSearchParams();
        formData.append('action', 'updateData');

        // Prepare data payload
        const payload = { ...updateData };
        const id = payload.id;
        const section = payload.section;
        delete payload.id;
        delete payload.section;

        formData.append('id', id);
        formData.append('section', section);
        formData.append('data', JSON.stringify(payload));

        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Update failed');
        }

        // Clear cache to ensure next fetch gets updated data
        clearCache();

        return result;

    } catch (error) {
        console.error('Update error:', error);
        throw error;
    }
}

/**
 * Update user's last seen ID (記憶No)
 * @param {string} userId - User ID
 * @param {number} lastSeenId - Last seen data ID
 * @return {Promise<Object>} Result
 */
async function updateLastSeenId(userId, lastSeenId) {
    try {
        console.log('Updating lastSeenId:', userId, lastSeenId);
        const formData = new URLSearchParams();
        formData.append('action', 'updateLastSeenId');
        formData.append('userId', userId);
        formData.append('lastSeenId', lastSeenId);

        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Update lastSeenId failed');
        }

        return result;

    } catch (error) {
        console.error('Update lastSeenId error:', error);
        throw error;
    }
}

