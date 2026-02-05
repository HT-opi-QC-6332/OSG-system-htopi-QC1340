// App Logic

let currentFilter = 'all'; // 処理状況（all, unconfirmed, completed, ng）
let currentDate = 'all'; // 日付（all, today, yesterday）
let currentWorkplace = 'all'; // 職場別（all, press, parts, cab）
let currentCompletionProcess = 'all'; // 完成工程（all, has）
let allShiftData = []; // Store all data from API
let searchTimeout; // デバウンス用のタイマー
let currentPage = 1; // 現在のページ
const ITEMS_PER_PAGE = 50; // 1ページあたりの表示件数
let lastMaxId = 0; // 最新データのID（通知用）
let autoUpdateTimer = null;
const DEFAULT_AUTO_UPDATE_MINUTES = 5;
let autoUpdateMinutes = parseInt(localStorage.getItem('OSG_AUTO_UPDATE_MINUTES')) || DEFAULT_AUTO_UPDATE_MINUTES; // 初期値読み込み
let autoUpdateInterval = autoUpdateMinutes * 60 * 1000; // ミリ秒変換
let notificationAudio = null; // グローバルAudioオブジェクト（再利用用）
let isSoundEnabled = localStorage.getItem('OSG_SOUND_ENABLED') !== 'false'; // 通知音設定（デフォルトON）
let countdownTimer = null; // カウントダウン表示用タイマー
let nextUpdateTime = 0; // 次回更新予定時刻

// NEWバッジ表示用のIDセット（localStorageから復元 - ブラウザを閉じても永続化）
const savedNewItemIds = localStorage.getItem('newItemIds');
window.newItemIds = savedNewItemIds ? new Set(JSON.parse(savedNewItemIds)) : new Set();

document.addEventListener('DOMContentLoaded', async () => {
    const shiftList = document.getElementById('shiftList');
    const searchInput = document.getElementById('searchInput');

    // Filter buttons and dropdowns
    const filterAll = document.getElementById('filterAll');
    const filterStatus = document.getElementById('filterStatus');
    const statusDropdown = document.getElementById('statusDropdown');
    const filterDate = document.getElementById('filterDate');
    const dateDropdown = document.getElementById('dateDropdown');
    const filterWorkplace = document.getElementById('filterWorkplace');
    const workplaceDropdown = document.getElementById('workplaceDropdown');
    const filterCompletionProcess = document.getElementById('filterCompletionProcess');
    const completionProcessDropdown = document.getElementById('completionProcessDropdown');
    const clearSearchBtn = document.getElementById('clearSearch'); // ×ボタン

    // Toast Container生成
    if (!document.getElementById('toastContainer')) {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Show loading state
    showLoading();

    // 初期フィルターの自動設定（ユーザーの職場コードに基づく）
    const user = Auth.getUser();
    if (user && user.workplaceCode && user.workplaceCode !== 'all') {
        const workplaceMapRev = {
            'P': 'press',
            'A': 'parts',
            'C': 'cab',
            'H': 'supply',
            'AC': 'ac', // 組立全般
            'PH': 'ph'  // プレス/補給
        };
        const defaultFilter = workplaceMapRev[user.workplaceCode];
        if (defaultFilter) {
            currentWorkplace = defaultFilter;
            console.log('Set initial workplace filter:', currentWorkplace);
            updateFilterUI(); // UIにも反映（activeクラス付与など）
        }
    }

    // 自動更新設定の初期化（UIへの反映）- 選択式ドロップダウン対応
    const setupAutoUpdateSelect = (selectId, btnId) => {
        const select = document.getElementById(selectId);
        const btn = document.getElementById(btnId);

        if (select && btn) {
            // 現在の設定値を選択状態にする
            select.value = autoUpdateMinutes;

            // クリック時にドロップダウンメニューが閉じないようにする
            select.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // 保存ボタンクリック処理
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // ドロップダウン閉じ防止
                e.preventDefault();

                const val = Number(select.value);

                // 選択式なのでバリデーション不要、そのまま設定
                autoUpdateMinutes = val;
                autoUpdateInterval = val * 60 * 1000;
                localStorage.setItem('OSG_AUTO_UPDATE_MINUTES', val);
                console.log(`Auto update interval set to ${val} minutes.`);

                showToast('設定保存', `自動更新を ${val} 分に設定しました。`, 'success');

                // 自動的にメニューを閉じる
                const userDropdown = document.getElementById('userDropdown');
                const mobileDropdown = document.getElementById('mobileDropdown');
                if (userDropdown) userDropdown.classList.remove('show');
                if (mobileDropdown) mobileDropdown.classList.remove('show');

                // もう一方の選択欄も同期（PC <-> Mobile）
                const otherSelectId = selectId === 'autoUpdateInterval' ? 'mobileAutoUpdateInterval' : 'autoUpdateInterval';
                const otherSelect = document.getElementById(otherSelectId);
                if (otherSelect) otherSelect.value = val;

                // タイマー再起動 (即時リセット)
                startAutoUpdate(true);
            });
        }
    };

    setupAutoUpdateSelect('autoUpdateInterval', 'saveAutoUpdateBtn');
    setupAutoUpdateSelect('mobileAutoUpdateInterval', 'mobileSaveAutoUpdateBtn');

    // メニューを開いた時に、自動更新設定の数値を現在の設定値にリセットする
    // ケース：数字を消して（空欄で）閉じた後、再度開いたときに空欄のままではなく元の数字を表示したい
    const resetAutoUpdateInput = () => {
        const pcInput = document.getElementById('autoUpdateInterval');
        const mobileInput = document.getElementById('mobileAutoUpdateInterval');
        if (pcInput) pcInput.value = autoUpdateMinutes;
        if (mobileInput) mobileInput.value = autoUpdateMinutes;
    };

    const userMenuBtn = document.getElementById('userMenuBtn');
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', resetAutoUpdateInput);
    }

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', resetAutoUpdateInput);
    }

    // --- Sound Toggle Logic ---
    const setupSoundToggle = () => {
        const pcRadios = document.querySelectorAll('input[name="sound"]');
        const mobileRadios = document.querySelectorAll('input[name="mobileSound"]');

        const updateRadios = (enabled) => {
            const val = enabled ? 'on' : 'off';
            pcRadios.forEach(r => { if (r.value === val) r.checked = true; });
            mobileRadios.forEach(r => { if (r.value === val) r.checked = true; });
        };

        // 初期表示設定
        updateRadios(isSoundEnabled);

        const handleSoundChange = (e) => {
            const enabled = e.target.value === 'on';
            isSoundEnabled = enabled;
            localStorage.setItem('OSG_SOUND_ENABLED', enabled);
            console.log(`Notification sound set to: ${enabled ? 'ON' : 'OFF'}`);
            // PC/Mobile同期
            updateRadios(enabled);

            // テスト再生（ONにした時のみ）
            if (enabled) {
                playNotificationSound();
            }
        };

        pcRadios.forEach(r => r.addEventListener('change', handleSoundChange));
        mobileRadios.forEach(r => r.addEventListener('change', handleSoundChange));
    };
    setupSoundToggle();

    try {
        // Fetch data from GAS API
        const responseIsObject = await fetchShiftData();
        // 互換性チェック（api.js更新前後）
        let userSettings = null;
        if (Array.isArray(responseIsObject)) {
            allShiftData = responseIsObject;
        } else {
            allShiftData = responseIsObject.data || [];
            userSettings = responseIsObject.userSettings;
        }

        // サーバーからのユーザー設定反映（記憶No同期）
        if (userSettings && userSettings.lastSeenId && Auth.isLoggedIn()) {
            console.log('Syncing user settings from server:', userSettings);
            const currentUser = Auth.getUser();
            if (currentUser) {
                // サーバーの記憶Noを採用
                currentUser.lastSeenId = userSettings.lastSeenId;
                Auth.updateUser({ lastSeenId: userSettings.lastSeenId });
            }
        }

        // IDの最大値を記録（初回通知防止）
        if (allShiftData.length > 0) {
            lastMaxId = Math.max(...allShiftData.map(item => Number(item.id)));
        }

        // 起動時の新規データチェック（記憶Noとの比較）
        checkInitialNotifications(allShiftData);

        // Initial Render
        renderShifts(getFilteredData());

        // 記憶Noを最新IDに更新（次回のため）
        updateLastSeenIdToServer();

    } catch (error) {
        showError(error.message);
        return;
    }

    // Initial Layout Adjustment
    adjustLayout();

    // --- Audio Unlock Logic ---
    // ヘルパー：Audioオブジェクトの取得（シングルトン）
    const getNotificationAudio = () => {
        if (!notificationAudio) {
            const isSubDir = window.location.pathname.includes('/html/');
            const path = isSubDir ? '../assets/notification.mp3' : 'assets/notification.mp3';
            notificationAudio = new Audio(path);
        }
        return notificationAudio;
    };

    // ブラウザの自動再生ポリシー対策：ユーザーの初回操作時に無音で再生してアンロックする
    // ブラウザの自動再生ポリシー対策：ユーザーの初回操作時に再生してアンロックする
    const unlockAudio = () => {
        const audio = getNotificationAudio();

        // 確実に無音にする（ブラウザのアンロック実績のためだけで、聞かせる必要はない）
        audio.volume = 0;

        // 再生状態をリセット
        audio.load();

        // 再生する
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('Audio playback unlocked (Silent)');
                // 念のため一時停止
                audio.pause();
                audio.currentTime = 0;
                // これで次回以降 playNotificationSound() が呼ばれた際に音が鳴るようになる
            }).catch(e => {
                console.log('Audio unlock failed (likely waiting for interaction):', e);
            });
        }
    };

    /**
     * Show Welcome Modal for Audio Unlock
     * ログイン情報を表示し、OKボタンで音声アンロックを行う
     */
    const showWelcomeModal = () => {
        const user = Auth.getUser();
        if (!user) return; // ログインしていない場合は出さない

        // F5更新時も毎回出すため、ここでのセッションチェックは削除、または
        // 起動時にこのフラグを消去する運用にする。
        // ここでは念のためチェックせず、常に表示する形にするが、
        // startAutoUpdateのガードのためにフラグ自体は必要。
        // なので、「表示前にフラグを消す」処理を入れる。
        sessionStorage.removeItem('osg_welcome_shown');

        // 職場名の解決
        const wpName = CONFIG.WORKPLACE_NAME_MAP[user.workplaceCode] || user.workplaceCode || '-';

        // ロール名の解決
        const roleText = CONFIG.ROLE_NAME_MAP[user.role] || user.role;

        const modalHtml = `
            <div class="welcome-modal-overlay" id="welcomeModal">
                <div class="welcome-modal-card">
                    <div class="welcome-header">
                        <i class="fa-solid fa-circle-check"></i> ログイン完了
                    </div>
                    <div class="welcome-info">
                        <div class="welcome-info-row">
                            <span class="welcome-info-label">ユーザー名：</span>
                            <span class="welcome-info-value">${user.name} 様</span>
                        </div>
                        <div class="welcome-info-row">
                            <span class="welcome-info-label">ユーザークラス：</span>
                            <span class="welcome-info-value">${roleText}</span>
                        </div>
                        <div class="welcome-info-row">
                            <span class="welcome-info-label">担当職場：</span>
                            <span class="welcome-info-value">${wpName}</span>
                        </div>
                        <div class="welcome-divider"></div>
                        <span class="welcome-warning-text">注意：通知音がなります。</span><br>
                        通知音のON/OFFは設定メニューから変更できます。
                    </div>
                    <button class="welcome-ok-btn" id="welcomeOkBtn">
                        確認
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const okBtn = document.getElementById('welcomeOkBtn');
        const modal = document.getElementById('welcomeModal');

        okBtn.addEventListener('click', () => {
            // 音声アンロック実行
            unlockAudio();

            // モーダルを消す
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.remove();
            }, 300);

            // 表示済みフラグをセット
            sessionStorage.setItem('osg_welcome_shown', 'true');

            // 自動更新タイマーを開始（ここで初めてスタート）
            startAutoUpdate();



            // 保留していた初期通知があれば実行
            if (window.pendingInitialNotifications && window.pendingInitialNotifications.length > 0) {
                const items = window.pendingInitialNotifications;
                const details = items.map(item => {
                    const code = item.distributionCode;
                    const name = CONFIG.WORKPLACE_NAME_MAP[code] || code || '-';
                    // newWorkerプロパティが存在するか確認、なければ空文字
                    return `【${name}】No.${item.id}、${item.newWorker || ''}`;
                }).join('\n');

                // トースト通知
                showToast(
                    '新しい作業者交替が発生しています',
                    `${items.length}件の新しい作業者交替を検知しました。\n${details}`,
                    'info'
                );

                // デスクトップ通知
                if (Notification.permission === 'granted') {
                    new Notification('新しい作業者交替が発生しています', {
                        body: `${items.length}件の新しい作業者交替を検知しました。\n${details}`,
                        tag: 'osg-initial'
                    });
                }

                // 通知音再生（アンロック直後なので鳴るはず）
                // 少しだけ遅延させてアンロックの確実性を高める
                setTimeout(() => {
                    playNotificationSound();
                }, 200);

                // クリア
                window.pendingInitialNotifications = null;
            }
        });
    };

    // 初期化時にウェルカムモーダルを表示
    setTimeout(showWelcomeModal, 500);

    // 自動的なリスナーは削除（モーダルOKに一本化）
    // ---------------------------
    // ---------------------------

    // Search Filter Listener with Debounce (300ms)
    searchInput.addEventListener('input', () => {
        // ×ボタンの表示/非表示切り替え
        if (searchInput.value.length > 0) {
            clearSearchBtn.classList.add('show');
        } else {
            clearSearchBtn.classList.remove('show');
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1; // 検索時は1ページ目にリセット
            renderShifts(getFilteredData());
            window.scrollTo(0, 0); // 画面を上部にスクロール
        }, 300); // ユーザーが入力を止めてから300ms後に実行
    });

    // Clear Search Button
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.remove('show');
        renderShifts(getFilteredData());
        window.scrollTo(0, 0); // 画面を上部にスクロール
    });

    // Filter: All (Reset all filters)
    filterAll.addEventListener('click', () => {
        currentFilter = 'all';
        currentDate = 'all';
        currentWorkplace = 'all';
        currentCompletionProcess = 'all';
        currentPage = 1;
        updateFilterUI();
        renderShifts(getFilteredData());
        window.scrollTo(0, 0); // 画面を上部にスクロール
    });

    // Dropdown Toggle Handlers
    filterStatus.addEventListener('click', (e) => {
        e.stopPropagation();
        statusDropdown.classList.toggle('show');
        dateDropdown.classList.remove('show');
        workplaceDropdown.classList.remove('show');
        completionProcessDropdown.classList.remove('show');
    });

    filterDate.addEventListener('click', (e) => {
        e.stopPropagation();
        dateDropdown.classList.toggle('show');
        statusDropdown.classList.remove('show');
        workplaceDropdown.classList.remove('show');
        completionProcessDropdown.classList.remove('show');
    });

    filterWorkplace.addEventListener('click', (e) => {
        e.stopPropagation();
        workplaceDropdown.classList.toggle('show');
        statusDropdown.classList.remove('show');
        dateDropdown.classList.remove('show');
        completionProcessDropdown.classList.remove('show');
    });

    filterCompletionProcess.addEventListener('click', (e) => {
        e.stopPropagation();
        completionProcessDropdown.classList.toggle('show');
        statusDropdown.classList.remove('show');
        dateDropdown.classList.remove('show');
        workplaceDropdown.classList.remove('show');
    });

    // Dropdown Item Handlers
    // 処理状況
    statusDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            currentFilter = item.dataset.status;
            currentPage = 1;
            statusDropdown.classList.remove('show');
            updateFilterUI();
            renderShifts(getFilteredData());
            window.scrollTo(0, 0);
        });
    });

    // 日付
    dateDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            currentDate = item.dataset.date;
            currentPage = 1;
            dateDropdown.classList.remove('show');
            updateFilterUI();
            renderShifts(getFilteredData());
            window.scrollTo(0, 0);
        });
    });

    // 職場別
    workplaceDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            currentWorkplace = item.dataset.workplace;
            currentPage = 1;
            workplaceDropdown.classList.remove('show');
            updateFilterUI();
            renderShifts(getFilteredData());
            window.scrollTo(0, 0);
        });
    });

    // 完成工程
    completionProcessDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            currentCompletionProcess = item.dataset.completion;
            currentPage = 1;
            completionProcessDropdown.classList.remove('show');
            updateFilterUI();
            renderShifts(getFilteredData());
            window.scrollTo(0, 0);
        });
    });

    // Close all dropdowns when clicking outside
    document.addEventListener('click', () => {
        statusDropdown.classList.remove('show');
        dateDropdown.classList.remove('show');
        workplaceDropdown.classList.remove('show');
        completionProcessDropdown.classList.remove('show');

    });

    // --- Notification Button ---
    // 通知ボタンのクリックハンドラ（PC版とモバイル版共通）
    function handleNotificationClick() {
        if (Notification.permission === 'granted') {
            new Notification('通知機能は有効です', {
                body: 'OSG: 新着データがあればここにお知らせします。'
            });
            showToast('通知機能は有効です', 'success');

        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                updateNotificationIcon();
                if (permission === 'granted') {
                    new Notification('通知が有効になりました');
                    showToast('通知が有効になりました', 'success');
                }
            });
        } else {
            alert(
                '⚠️ ブラウザの設定で通知がブロックされています。\n\n' +
                '【設定方法】\n' +
                '1. ブラウザのアドレスバー左端の🔒マークをクリック\n' +
                '2. 「通知」を探して「許可」に変更\n' +
                '3. ページを再読み込み (F5キー)\n\n' +
                '詳しい手順は管理者にご確認ください。'
            );
        }
    }

    // PC版通知ボタン
    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        updateNotificationIcon();
        notificationBtn.addEventListener('click', handleNotificationClick);
    }

    // モバイル版通知ボタン
    const mobileNotificationBtn = document.getElementById('mobileNotificationBtn');
    if (mobileNotificationBtn) {
        mobileNotificationBtn.addEventListener('click', handleNotificationClick);
    }

    // --- Refresh Button ---
    // 更新ボタンのクリックハンドラ（PC版とモバイル版共通）
    async function handleRefreshClick(btn) {
        // Prevent multiple clicks
        if (btn.classList.contains('refreshing')) return;

        // 手動更新開始: 自動更新タイマーを停止
        if (autoUpdateTimer) {
            clearTimeout(autoUpdateTimer);
            autoUpdateTimer = null;
            console.log('Auto update timer stopped for manual refresh.');
        }

        btn.classList.add('refreshing');
        showToast('更新中', 'データを更新しています...', 'info');

        try {
            // Fetch latest data (skipping cache)
            const responseIsObject = await refreshData();

            // 共通更新処理を実行
            await processDataUpdate(responseIsObject, false);

        } catch (error) {
            showToast('更新失敗', 'データの更新に失敗しました。', 'error');
            console.error('Refresh error:', error);
        } finally {
            btn.classList.remove('refreshing');

            // 手動更新完了: 自動更新タイマーをリセット（ここから再カウント開始 - 即時リセット）
            startAutoUpdate(true);
            console.log('Auto update timer reset after manual refresh.');
        }
    }

    // PC版更新ボタン
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => handleRefreshClick(refreshBtn));
    }

    // モバイル版更新ボタン
    const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
    if (mobileRefreshBtn) {
        mobileRefreshBtn.addEventListener('click', () => handleRefreshClick(mobileRefreshBtn));
    }



    // Start Auto Update is deferred until welcome modal confirmation
    // startAutoUpdate();

    // モバイル用ヘッダー高さ調整 (ResizeObserver)
    const header = document.querySelector('.app-header');
    const listElement = document.querySelector('.shift-list');

    if (header && listElement) {
        const adjustPadding = () => {
            const headerHeight = header.offsetHeight;
            if (headerHeight > 0) {
                // 数値を丸めて微動を防止
                listElement.style.paddingTop = Math.round(headerHeight + 20) + 'px';
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            adjustPadding();
        });

        resizeObserver.observe(header);

        // ウィンドウリサイズ時も調整
        window.addEventListener('resize', adjustPadding);

        // 初期実行
        adjustPadding();
    }
});

/**
 * Common Data Update Logic (Used by Manual & Auto Update)
 * @param {Object} responseIsObject - Response from API
 * @param {boolean} isAutoUpdate - True if triggered by auto-update
 */
async function processDataUpdate(responseIsObject, isAutoUpdate = false) {
    let freshData = [];
    let userSettings = null;

    if (Array.isArray(responseIsObject)) {
        freshData = responseIsObject;
    } else {
        freshData = responseIsObject.data || [];
        userSettings = responseIsObject.userSettings;
    }

    // 1. サーバーからのユーザー設定反映（記憶No同期）
    if (userSettings && userSettings.lastSeenId && Auth.isLoggedIn()) {
        const currentUser = Auth.getUser();
        const serverLastSeenId = Number(userSettings.lastSeenId);
        const localLastSeenId = Number(currentUser?.lastSeenId || 0);

        // サーバーの値がローカルより大きい場合のみ同期（サーバーが最新を持っている場合）
        // サーバーの値がローカルより小さい場合は、ローカルが既に最新を認識しているため同期しない
        if (currentUser && serverLastSeenId > localLastSeenId) {
            console.log(`Syncing user settings from server (${isAutoUpdate ? 'auto' : 'manual'}):`, userSettings);
            currentUser.lastSeenId = serverLastSeenId;
            Auth.updateUser({ lastSeenId: serverLastSeenId });

            // アプリの認識(lastMaxId)もサーバーの記憶Noに合わせる
            lastMaxId = serverLastSeenId;
        } else if (serverLastSeenId < localLastSeenId) {
            console.log(`[DEBUG] Server lastSeenId (${serverLastSeenId}) is older than local (${localLastSeenId}), skipping sync.`);
        }
    }

    // 更新前のIDを保持
    const lastMaxId_prev = lastMaxId;

    // 2. データを更新（常に最新を反映）
    allShiftData = freshData;
    const currentMaxId = freshData.length > 0 ? Math.max(...freshData.map(item => Number(item.id))) : 0;
    lastMaxId = currentMaxId; // Update Max ID

    // 3. 差分検知
    if (currentMaxId > lastMaxId_prev) {
        const newItems = freshData.filter(item => Number(item.id) > lastMaxId_prev);

        // 通知処理（NEWバッジ情報更新）
        handleNotifications(newItems);

        // 通知音を再生 (NEWバッジが付く場合のみ)
        playNotificationSound();

        // トースト通知
        if (isAutoUpdate) {
            // 自動更新時のメッセージ
            showToast('自動更新', `${newItems.length}件の新しい作業者交替を検知しました。`, 'success');
        } else {
            // 手動更新時のメッセージ
            showToast('更新完了', `${newItems.length}件の新しい作業者交替を検知しました。`, 'success');
        }

        console.log(`Update detected: ${newItems.length} new items.`);
    } else {
        // ID増分なし
        if (!isAutoUpdate) {
            showToast('更新完了', '最新の状態です。', 'success');
        } else {
            console.log('Auto update: No new items.');
            showToast('自動更新完了', '最新の状態です。', 'success');
        }
    }

    // 4. 画面再描作（全てのデータ更新後に実行）
    renderShifts(getFilteredData());

    // 5. 記憶Noをサーバーに更新（手動・自動問わず、常に最新状態まで同期）
    // これにより、自動更新でも「配信済み」としてサーバー側を更新する（ユーザー要望対応）
    await updateLastSeenIdToServer();
}

/**
 * Update Filter UI (Buttons & Condition Text)
 */
function updateFilterUI() {
    const filterAllBtn = document.getElementById('filterAll');
    const filterStatusBtn = document.getElementById('filterStatus');
    const filterDateBtn = document.getElementById('filterDate');
    const filterWorkplaceBtn = document.getElementById('filterWorkplace');
    const filterCompletionProcessBtn = document.getElementById('filterCompletionProcess');
    const conditionDisplay = document.getElementById('filterConditionDisplay');

    // Reset all highlights first
    filterStatusBtn.classList.remove('active-filter');
    filterDateBtn.classList.remove('active-filter');
    filterWorkplaceBtn.classList.remove('active-filter');
    filterCompletionProcessBtn.classList.remove('active-filter');
    filterAllBtn.classList.remove('active');

    // Conditions List
    const conditions = [];

    // Check Status
    if (currentFilter !== 'all') {
        filterStatusBtn.classList.add('active-filter');
        const text = document.querySelector(`#statusDropdown [data-status="${currentFilter}"]`).textContent;
        conditions.push(text);
    }

    // Check Date
    if (currentDate !== 'all') {
        filterDateBtn.classList.add('active-filter');
        const text = document.querySelector(`#dateDropdown [data-date="${currentDate}"]`).textContent;
        conditions.push(text);
    }

    // Check Workplace
    if (currentWorkplace !== 'all') {
        filterWorkplaceBtn.classList.add('active-filter');
        const text = document.querySelector(`#workplaceDropdown [data-workplace="${currentWorkplace}"]`).textContent;
        conditions.push(text);
    }

    // Check Completion Process
    if (currentCompletionProcess !== 'all') {
        filterCompletionProcessBtn.classList.add('active-filter');
        const text = document.querySelector(`#completionProcessDropdown [data-completion="${currentCompletionProcess}"]`).textContent;
        conditions.push(text);
    }

    // Update Display
    if (conditions.length > 0) {
        // Active filters exist
        conditionDisplay.textContent = `フィルター：${conditions.join('、')}`;
        conditionDisplay.style.display = 'flex';
        // "All" button is inactive
    } else {
        // No filters active
        filterAllBtn.classList.add('active'); // "All" is active (Blue)
        conditionDisplay.style.display = 'none';
        conditionDisplay.textContent = '';
    }

    // Adjust layout after changing header height
    adjustLayout();
}

/**
 * Adjust content padding based on header height
 */
function adjustLayout() {
    const header = document.querySelector('.app-header');
    const shiftList = document.getElementById('shiftList');

    if (header && shiftList) {
        const headerHeight = header.offsetHeight;
        // 数値を丸めて微動を防止
        shiftList.style.paddingTop = Math.round(headerHeight + 20) + 'px';
    }
}



/* --- Edit Modal Logic --- */

const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editModalClose = document.getElementById('editModalClose');
const editCancelBtn = document.getElementById('editCancelBtn');

function openEditModal(item, section) {
    // Reset Form
    editForm.reset();
    document.getElementById('editShiftId').value = item.id;
    document.getElementById('editSection').value = section;
    document.getElementById('editModalId').textContent = item.id;

    // Show/Hide Fields based on section
    const mfgFields = document.getElementById('mfgFields');
    const qcFields = document.getElementById('qcFields');

    if (section === 'mfg') {
        mfgFields.style.display = 'block';
        qcFields.style.display = 'none';

        // Fill Values
        editForm.educator.value = item.educator || '';
        editForm.confirmPerson.value = item.confirmPerson || '';
        editForm.approver.value = item.approver || '';
    } else {
        mfgFields.style.display = 'none';
        qcFields.style.display = 'block';

        // Fill Values
        editForm.standardEducation.value = item.standardEducation || '';
        editForm.samplingInspection.value = item.samplingInspection || '';
        editForm.inspectionResult.value = item.inspectionResult || '';
        editForm.inspector.value = item.inspector || '';
    }

    // Show Modal
    editModal.classList.add('show');
}

function closeEditModal() {
    editModal.classList.remove('show');
}

// Close Events
if (editModalClose) editModalClose.addEventListener('click', closeEditModal);
if (editCancelBtn) editCancelBtn.addEventListener('click', closeEditModal);

// Close on outside click
window.addEventListener('click', (e) => {
    if (e.target === editModal) {
        closeEditModal();
    }
});

// Save Event
if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = document.getElementById('editSaveBtn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';

        try {
            const formData = new FormData(editForm);
            const updateData = {
                id: formData.get('editShiftId'), // Hidden ID
                section: formData.get('editSection') // mfg or qc
            };

            // Collect form fields based on section
            if (updateData.section === 'mfg') {
                updateData.educator = formData.get('educator');
                updateData.confirmPerson = formData.get('confirmPerson');
                updateData.approver = formData.get('approver');
            } else {
                updateData.standardEducation = formData.get('standardEducation');
                updateData.samplingInspection = formData.get('samplingInspection');
                updateData.inspectionResult = formData.get('inspectionResult');
                updateData.inspector = formData.get('inspector');
            }

            // Call API
            await updateShiftData(updateData);

            // Close Modal & Refresh
            closeEditModal();
            // Refresh data from server (skipping cache)
            showLoading(); // user feedback
            const freshData = await refreshData();

            // 共通更新処理を使用（レスポンスがオブジェクトの場合も適切にハンドリングされる）
            await processDataUpdate(freshData, false);

        } catch (error) {
            alert('保存に失敗しました: ' + error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    });
}


function getFilteredData() {
    let filtered = [...allShiftData];
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(item =>
            String(item.id).toLowerCase().includes(searchTerm) ||
            String(item.targetLine || '').toLowerCase().includes(searchTerm) ||
            String(item.newWorker || '').toLowerCase().includes(searchTerm) ||
            String(item.partNumber || '').toLowerCase().includes(searchTerm) ||
            String(item.partName || '').toLowerCase().includes(searchTerm)
        );
    }


    // 処理状況フィルター
    if (currentFilter === 'unconfirmed') {
        filtered = filtered.filter(item => item.completionStatus === 'T' || item.completionStatus !== 'C');
    } else if (currentFilter === 'completed') {
        filtered = filtered.filter(item => item.completionStatus === 'C');
    } else if (currentFilter === 'ng') {
        filtered = filtered.filter(item => {
            const hasNgText = (text) => text && String(text).toLowerCase().includes('ng');
            return item.completionStatus === 'NG' ||
                hasNgText(item.standardEducation) ||
                hasNgText(item.samplingInspection);
        });
    } else if (currentFilter === 'mfg_unconfirmed') {
        filtered = filtered.filter(item => {
            if (item.completionStatus === 'C') return false; // 完了済みは除外
            const isMfgUnconfirmed = !item.educator || !item.confirmPerson || !item.approver;
            return isMfgUnconfirmed;
        });
    } else if (currentFilter === 'qc_unconfirmed') {
        filtered = filtered.filter(item => {
            if (item.completionStatus === 'C') return false; // 完了済みは除外
            const isQcUnconfirmed = !item.standardEducation || !item.samplingInspection || !item.inspector || !item.inspectionResult;
            return isQcUnconfirmed;
        });
    }

    // 日付フィルター
    if (currentDate === 'today') {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        filtered = filtered.filter(item => {
            if (!item.occurrenceDate) return false;
            return item.occurrenceDate.startsWith(todayStr);
        });
    } else if (currentDate === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        filtered = filtered.filter(item => {
            if (!item.occurrenceDate) return false;
            return item.occurrenceDate.startsWith(yesterdayStr);
        });
    }

    // 職場別フィルター - 完全一致 + 複合条件(AC, PH)
    if (currentWorkplace !== 'all') {
        const workplaceMap = {
            'press': 'P',
            'parts': 'A',
            'cab': 'C',
            'supply': 'H',
            'ac': ['A', 'C'], // ACは A or C
            'ph': ['P', 'H']  // PHは P or H
        };
        const target = workplaceMap[currentWorkplace];

        if (Array.isArray(target)) {
            // 複合条件 (AC, PH)
            filtered = filtered.filter(item => target.includes(item.distributionCode));
        } else if (target) {
            // 単一条件
            filtered = filtered.filter(item => item.distributionCode === target);
        }
    }

    // 完成工程フィルター（◎のみ）
    if (currentCompletionProcess === 'has') {
        filtered = filtered.filter(item => item.completionProcess === '◎');
    }


    // Sort by ID Descending (Newest first)
    filtered.sort((a, b) => Number(b.id) - Number(a.id));

    return filtered;
}

function renderShifts(data) {
    const shiftList = document.getElementById('shiftList');

    if (data.length === 0) {
        shiftList.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:20px;">データが見つかりません</div>';
        return;
    }

    // ページネーション計算
    const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);

    // 現在のページが範囲外なら調整
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, data.length);
    const visibleData = data.slice(startIndex, endIndex);

    // DocumentFragmentを使用してDOM操作を最小化
    const fragment = document.createDocumentFragment();

    visibleData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'shift-card';

        // 完成工程が◎の場合、ピンク色クラスを追加
        if (item.completionProcess === '◎') {
            card.classList.add('completed-process');
        }
        // Status Badge Logic based on completionStatus
        let statusHtml = '';

        // NG判定
        const hasNgText = (text) => text && String(text).toLowerCase().includes('ng');
        const isNg = item.completionStatus === 'NG' ||
            hasNgText(item.standardEducation) ||
            hasNgText(item.samplingInspection);

        // 未確認判定
        const isMfgUnconfirmed = !item.educator || !item.confirmPerson || !item.approver;
        const isQcUnconfirmed = !item.standardEducation || !item.samplingInspection || !item.inspector || !item.inspectionResult;

        // 完了判定: ステータスがC かつ NG要素なし かつ 未確認要素なし
        if (item.completionStatus === 'C' && !isNg && !isMfgUnconfirmed && !isQcUnconfirmed) {
            statusHtml = `<span class="status-badge status-ok">完了</span>`;
        } else {
            let badges = [];

            // 1. 未確認バッジ（優先・上）
            if (isMfgUnconfirmed) {
                badges.push(`<span class="status-badge status-mfg-unconfirmed">製造：未確認</span>`);
            }
            if (isQcUnconfirmed) {
                badges.push(`<span class="status-badge status-qc-unconfirmed">品管：未確認</span>`);
            }

            // 2. NGバッジ（下）
            if (isNg) {
                badges.push(`<span class="status-badge status-ng">NG</span>`);
            }

            // バッジがない場合（Cではないが、NG判定もなく、未確認項目もない場合 -> まれなケースだが未確認扱いとする）
            if (badges.length === 0) {
                badges.push(`<span class="status-badge status-ng">未確認</span>`);
            }

            statusHtml = `<div class="status-badge-container">${badges.join('')}</div>`;
        }

        // 権限チェック
        const user = Auth.getUser();
        const role = user ? user.role : '閲覧者';

        // 編集権限の判定
        const canEditMfg = role === '管理者' || role === '製造課';
        const canEditQC = role === '管理者' || role === '品管課';

        const mfgEditBtn = canEditMfg ? `<button class="section-edit-btn mfg-edit-btn" title="編集"><i class="fa-solid fa-pen-to-square"></i></button>` : '';
        const qcEditBtn = canEditQC ? `<button class="section-edit-btn qc-edit-btn" title="編集"><i class="fa-solid fa-pen-to-square"></i></button>` : '';

        // NEWバッジの判定（文字列で比較）
        const isNew = window.newItemIds && window.newItemIds.has(String(item.id));
        const newBadge = isNew ? `<span class="new-badge">NEW</span>` : '';

        const html = `
            <div class="card-summary">
                <div class="card-header-row">
                    <div class="shift-id-wrapper">
                        <span class="shift-id">No. ${item.id}</span>
                        ${newBadge}
                    </div>
                    ${statusHtml}
                </div>
                
                <div class="info-grid">
                    <div class="info-item">
                        <span class="label">作業者交替発生日</span>
                        <span class="value">${formatDateTime(item.occurrenceDate)}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">ライン</span>
                        <span class="value">${item.targetLine || '-'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">作業者</span>
                        <span class="value">${item.newWorker || '-'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Lot</span>
                        <span class="value">${item.changeLot || '-'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">品番</span>
                        <span class="value">${item.partNumber || '-'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">品名</span>
                        <span class="value">${item.partName || '-'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">数量</span>
                        <span class="value">${item.quantity || '-'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">完成工程</span>
                        <span class="value">${item.completionProcess || '-'}</span>
                    </div>
                </div>

                ${item.remarks ? `
                <div class="remarks-row">
                    <i class="fa-solid fa-circle-info"></i> ${item.remarks}
                </div>` : ''}
            </div>

            <!-- Detailed Section -->
            <div class="card-details">
                <!-- Manufacturing Dept -->
                <div class="detail-section mfg-section">
                    <h3>
                        <span><i class="fa-solid fa-wrench"></i> 製造課 (Manufacturing)</span>
                        ${mfgEditBtn}
                    </h3>
                    <div class="detail-grid">
                        <div class="info-item">
                            <span class="label">教育担当者</span>
                            <span class="value">${item.educator || '<span style="opacity:0.5">未記入</span>'}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">交替品確認者</span>
                            <span class="value">${item.confirmPerson || '<span style="opacity:0.5">未記入</span>'}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">交替承認者</span>
                            <span class="value">${item.approver || '<span style="opacity:0.5">未記入</span>'}</span>
                        </div>
                    </div>
                </div>

                <!-- QC Dept -->
                <div class="detail-section qc-section">
                    <h3>
                        <span><i class="fa-solid fa-clipboard-check"></i> 品質管理課 (QC)</span>
                        ${qcEditBtn}
                    </h3>
                    <div class="detail-grid">
                        <div class="info-item">
                            <span class="label">標準書教育</span>
                            <span class="value">${item.standardEducation || '<span style="opacity:0.5">未記入</span>'}</span>
                        </div>
                         <div class="info-item">
                            <span class="label">抜取り検査</span>
                            <span class="value">${item.samplingInspection || '<span style="opacity:0.5">未記入</span>'}</span>
                        </div>
                         <div class="info-item">
                            <span class="label">担当者</span>
                            <span class="value">${item.inspector || '<span style="opacity:0.5">未記入</span>'}</span>
                        </div>
                         <div class="info-item" style="grid-column: 1 / -1;">
                            <span class="label">検査結果</span>
                            <span class="value">${item.inspectionResult || '<span style="opacity:0.5">未記入</span>'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        card.innerHTML = html;

        // Toggle Expand Event
        card.addEventListener('click', (e) => {
            // Prevent expand if clicking edit button
            if (e.target.closest('.section-edit-btn')) return;

            // カードを展開する
            card.classList.toggle('expanded');

            // 展開時にNEWバッジを消す（既読にする）
            if (card.classList.contains('expanded') && window.newItemIds) {
                const itemId = String(item.id);
                if (window.newItemIds.has(itemId)) {
                    window.newItemIds.delete(itemId);
                    // sessionStorageも更新
                    saveNewItemIds();
                    // NEWバッジ要素を削除
                    const badge = card.querySelector('.new-badge');
                    if (badge) {
                        badge.remove();
                    }
                }
            }
        });

        // Edit Button Events
        const mfgBtn = card.querySelector('.mfg-edit-btn');
        if (mfgBtn) {
            mfgBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(item, 'mfg');
            });
        }

        const qcBtn = card.querySelector('.qc-edit-btn');
        if (qcBtn) {
            qcBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(item, 'qc');
            });
        }

        fragment.appendChild(card);
    });

    // 一度だけDOM操作を実行
    shiftList.innerHTML = '';
    shiftList.appendChild(fragment);

    // ページネーションフッターの作成
    renderPaginationFooter(shiftList, data, totalPages);
}

/**
 * ページネーションフッターを表示
 */
function renderPaginationFooter(container, data, totalPages) {
    if (totalPages <= 1) {
        const info = document.createElement('div');
        info.className = 'pagination-info';
        info.textContent = `全 ${data.length} 件`;
        info.style.textAlign = 'center';
        info.style.padding = '20px';
        info.style.color = 'var(--text-secondary)';
        container.appendChild(info);
        return;
    }

    const footer = document.createElement('div');
    footer.className = 'pagination-footer';

    // 前へボタン
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderShifts(data);
            window.scrollTo(0, 0); // 上までスクロール
        }
    };

    // ページ情報とジャンプ入力
    const pageInfo = document.createElement('div');
    pageInfo.className = 'page-info';
    pageInfo.innerHTML = `
        <span>Page</span>
        <input type="number" id="pageJumpInput" min="1" max="${totalPages}" value="${currentPage}">
        <span>/ ${totalPages}</span>
    `;

    // ジャンプ機能
    const jumpInput = pageInfo.querySelector('#pageJumpInput');
    jumpInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (val >= 1 && val <= totalPages) {
            currentPage = val;
            renderShifts(data);
            window.scrollTo(0, 0);
        } else {
            e.target.value = currentPage; // 不正な値なら戻す
        }
    });

    // 次へボタン
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderShifts(data);
            window.scrollTo(0, 0);
        }
    };

    footer.appendChild(prevBtn);
    footer.appendChild(pageInfo);
    footer.appendChild(nextBtn);

    container.appendChild(footer);
}

/**
 * ローディング表示
 */


/**
 * エラー表示
 * @param {string} message - エラーメッセージ
 */


/**
 * 日時フォーマット関数
 * @param {string} dateStr - ISO形式の日時文字列
 * @return {string} フォーマット済み日時文字列
 */
function formatDateTime(dateStr) {
    if (!dateStr) return '-';

    try {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (error) {
        return dateStr; // フォーマットに失敗した場合は元の文字列を返す
    }
}

// --- Auto Update & Notification Logic ---

function startAutoUpdate(isManualReset = false) {
    // ウェルカムモーダル（通知音許可）が完了するまでは自動更新をスタートしない
    if (!sessionStorage.getItem('osg_welcome_shown')) {
        console.log('Auto-update paused: waiting for welcome modal confirmation.');
        return;
    }

    if (autoUpdateTimer) clearTimeout(autoUpdateTimer);

    // 状態リセット
    isTimerPaused = false;
    pausedRemainingTime = 0;

    // 設定値からカウントダウンを開始（ゆらぎを廃止）
    const delay = autoUpdateInterval;

    autoUpdateTimer = setTimeout(async () => {
        await checkForUpdates();
        startAutoUpdate(); // 次のタイマーセット
    }, delay);

    // カウントダウン開始
    nextUpdateTime = Date.now() + delay;
    startCountdown();

    console.log(`Auto update timer set. Delay: ${Math.round(delay / 1000)}s${isManualReset ? ' (Manual Reset)' : ''}`);
}

/**
 * Start Countdown Timer Logic
 */
function startCountdown() {
    // 既存のタイマーをクリア
    if (countdownTimer) clearInterval(countdownTimer);

    const updateDisplay = () => {
        const editModal = document.getElementById('editModal');
        const passwordModal = document.getElementById('passwordModal');

        const shouldPause =
            (editModal && editModal.classList.contains('show')) ||
            (passwordModal && passwordModal.classList.contains('show'));

        if (shouldPause) {
            if (!isTimerPaused) {
                // 一時停止開始: 残り時間を記録し、Timeoutをクリア
                isTimerPaused = true;
                pausedRemainingTime = nextUpdateTime - Date.now();
                if (autoUpdateTimer) clearTimeout(autoUpdateTimer);
                console.log('Countdown paused. Remaining:', Math.round(pausedRemainingTime / 1000), 's');
            }
            // 表示は更新しない（現在の秒数で止める、または --:-- にする場合は以下）
            return;
        } else {
            if (isTimerPaused) {
                // 一時停止解除: 新しい終了時刻を設定し、Timeoutを再セット
                isTimerPaused = false;
                nextUpdateTime = Date.now() + pausedRemainingTime;

                autoUpdateTimer = setTimeout(async () => {
                    await checkForUpdates();
                    startAutoUpdate();
                }, pausedRemainingTime);

                console.log('Countdown resumed. Next update in:', Math.round(pausedRemainingTime / 1000), 's');
            }
        }

        const now = Date.now();
        const diff = nextUpdateTime - now;

        let text = '--:--';
        if (diff > 0) {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } else {
            text = '00:00'; // 更新直前
        }

        const pcEl = document.getElementById('autoUpdateCountdown');
        const mobileEl = document.getElementById('mobileAutoUpdateCountdown');
        if (pcEl) pcEl.textContent = text;
        if (mobileEl) mobileEl.textContent = text;
    };

    updateDisplay(); // 初回即時実行
    countdownTimer = setInterval(updateDisplay, 1000);
}

/**
 * Stop Countdown Timer
 */
function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    const pcEl = document.getElementById('autoUpdateCountdown');
    const mobileEl = document.getElementById('mobileAutoUpdateCountdown');
    if (pcEl) pcEl.textContent = '--:--';
    if (mobileEl) mobileEl.textContent = '--:--';
}

async function checkForUpdates() {
    // 編集モード中（モーダル表示中）またはカード展開中は更新をスキップ
    const editModal = document.getElementById('editModal');
    const passwordModal = document.getElementById('passwordModal');
    const hasExpandedCard = document.querySelector('.shift-card.expanded') !== null;

    const isEditingMode =
        (editModal && editModal.classList.contains('show')) ||
        (passwordModal && passwordModal.classList.contains('show')) ||
        hasExpandedCard;

    if (isEditingMode) {
        console.log('Editing mode or expanded card active, skipping auto-update.');
        return; // 更新をスキップ（次のタイマーはstartAutoUpdateで設定される）
    }

    try {
        console.log('Checking for updates...');
        showToast('自動更新', '自動更新します。', 'info');

        // 自動更新時はキャッシュを無視して常に最新データを取得
        const responseIsObject = await fetchShiftData(true);

        // 共通更新処理を実行 (isAutoUpdate = true)
        await processDataUpdate(responseIsObject, true);

    } catch (error) {
        console.error('Auto update failed:', error);
    }
}

function handleNotifications(newItems) {
    if (!newItems || newItems.length === 0) return;

    const user = Auth.getUser();
    const myWorkplace = user ? user.workplaceCode : '';

    // 1. ユーザーの職場コードでフィルタリング
    // AC -> A or C, PH -> P or H, H -> H, etc.
    const targetItems = newItems.filter(item => {
        if (!myWorkplace) return false;
        if (myWorkplace === 'all') return true;

        // 複合コード対応
        if (myWorkplace === 'AC') {
            return item.distributionCode === 'A' || item.distributionCode === 'C';
        }
        if (myWorkplace === 'PH') {
            return item.distributionCode === 'P' || item.distributionCode === 'H';
        }

        // 通常コード (P, A, C, H)
        return item.distributionCode === myWorkplace;
    });

    if (targetItems.length === 0) return;

    // 2. NEWバッジ用ID記録（フィルタリング済みデータのみ）
    const existingIds = window.newItemIds || new Set();
    targetItems.forEach(item => existingIds.add(String(item.id)));
    window.newItemIds = existingIds;
    saveNewItemIds(); // localStorage, sessionStorage同期

    // 3. 通知処理（許可されている場合） - デスクトップ通知
    const workplaceNameMap = {
        'P': 'プレス',
        'A': '部品組立',
        'C': 'キャブ組立',
        'H': '補給'
    };

    const formatItem = (item) => {
        const code = item.distributionCode;
        const name = workplaceNameMap[code] || code || '-';
        return `【${name}】No.${item.id}、${item.newWorker}`;
    };

    if (Notification.permission === 'granted') {
        const title = '新しい作業者交替が発生しています';
        const body = `${targetItems.length}件の新しい作業者交替を検知しました。\n` +
            targetItems.map(item => formatItem(item)).join('\n');

        const notification = new Notification(title, {
            body: body,
            tag: 'osg-update'
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }

    // 4. トースト通知（常に表示）
    const details = targetItems.map(item => formatItem(item)).join('\n');
    showToast(
        '新しい作業者交替が発生しています',
        `${targetItems.length}件の新しい作業者交替を検知しました。\n${details}`,
        'info'
    );
}

/**
 * NEWバッジIDをlocalStorageに保存（ブラウザを閉じても永続化）
 */
function saveNewItemIds() {
    localStorage.setItem('newItemIds', JSON.stringify([...window.newItemIds]));
}

/**
 * 全て既読にする - 全てのNEWバッジを消去
 */
function markAllAsRead() {
    // newItemIdsをクリア
    window.newItemIds = new Set();
    // sessionStorageも更新
    saveNewItemIds();

    // 画面上の全てのNEWバッジを削除
    document.querySelectorAll('.new-badge').forEach(badge => {
        badge.remove();
    });

    // トースト通知
    showToast('既読', '全ての新着データを既読にしました。', 'success');
}

function updateNotificationIcon() {
    // PC版とモバイル版両方の通知ボタンを更新
    const buttons = [
        document.getElementById('notificationBtn'),
        document.getElementById('mobileNotificationBtn')
    ];

    buttons.forEach(btn => {
        if (!btn) return;

        if (Notification.permission === 'granted') {
            btn.classList.add('active');
            btn.title = '通知オン (クリックでテスト通知)';
            btn.querySelector('i').className = 'fa-solid fa-bell';
            btn.style.opacity = '1';
        } else if (Notification.permission === 'denied') {
            btn.classList.remove('active');
            btn.title = '通知ブロック中';
            btn.querySelector('i').className = 'fa-solid fa-bell-slash';
            btn.style.opacity = '0.5';
        } else {
            btn.classList.remove('active');
            btn.title = '通知を受け取る（クリックして許可）';
            btn.querySelector('i').className = 'fa-solid fa-bell-slash';
            btn.style.opacity = '1';
        }
    });
}

/**
 * Show In-App Toast Notification
 * @param {string} title 
 * @param {string} message 
 * @param {string} type 'info' or 'success'
 */
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    toast.innerHTML = `
        <div class="toast-header">
            <span>${title}</span>
            <button class="toast-close">&times;</button>
        </div>
        <div class="toast-body">${message}</div>
    `;

    // Close event
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        removeToast(toast);
    };

    // Auto remove after 10 seconds
    setTimeout(() => {
        removeToast(toast);
    }, 10000);

    // Click to scroll to top (optional)
    toast.onclick = (e) => {
        if (e.target.closest('.toast-close')) return;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        removeToast(toast);
    };

    container.appendChild(toast);
}

function removeToast(toast) {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    toast.addEventListener('animationend', () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
}

/**
 * Show Loading State
 */
function showLoading() {
    const shiftList = document.getElementById('shiftList');
    if (shiftList) {
        shiftList.innerHTML = `
            <div class="loading-container">
                <i class="fa-solid fa-spinner fa-spin fa-3x" style="color:var(--accent-blue); margin-bottom: 20px;"></i>
                <p>データを読み込んでいます...</p>
            </div>
        `;
    }
}

/**
 * Show Error State
 * @param {string} message 
 */
function showError(message) {
    console.error(message);
    const shiftList = document.getElementById('shiftList');
    if (shiftList) {
        shiftList.innerHTML = `
            <div class="error-container">
                <i class="fa-solid fa-triangle-exclamation fa-3x" style="color:#f87171; margin-bottom: 20px;"></i>
                <p>エラーが発生しました</p>
                <p style="color:var(--text-secondary); font-size: 0.9rem; margin-top:10px;">${message}</p>
                <button onclick="location.reload()" style="margin-top:20px; padding:8px 16px; background:var(--accent-blue); border:none; border-radius:4px; color:white; cursor:pointer;">
                    <i class="fa-solid fa-rotate-right"></i> 再読み込み
                </button>
            </div>
        `;
    }
    showToast('エラー', 'データの読み込みに失敗しました', 'error');
}

/**
 * Play Notification Sound
 * NEWバッジが付く更新時に音を鳴らす
 */
function playNotificationSound() {
    if (!isSoundEnabled) {
        console.log('Notification sound skipped (Disabled by user).');
        return;
    }

    try {
        // グローバルオブジェクトを使用（または新規作成）
        // unlockAudioですでに作られていれば、それが使われる（アンロック済み）
        let audio = notificationAudio;
        if (!audio) {
            // unlockがまだ走っていない場合のフォールバック
            const isSubDir = window.location.pathname.includes('/html/');
            const path = isSubDir ? '../assets/notification.mp3' : 'assets/notification.mp3';
            audio = new Audio(path);
            notificationAudio = audio; // グローバルに保存
        }

        audio.volume = 0.5; // 音量
        audio.currentTime = 0; // 最初から再生

        // 再生を試みる
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // 自動再生ポリシーなどでブロックされた場合のエラーハンドリング
                console.warn('Notification sound play failed:', error);

                if (error.name === 'NotAllowedError') {
                    // ユーザーに操作を促すトーストを表示
                    showToast('通知音エラー', '画面をクリックして通知音を有効にしてください', 'info');
                }
            });
        }
    } catch (e) {
        console.error('Audio setup error:', e);
    }
}

/**
 * 起動時の新規データチェック（記憶Noとの比較）
 * @param {Array} allData - 全データ
 */
function checkInitialNotifications(allData) {
    const user = Auth.getUser();
    if (!user || !user.lastSeenId) {
        // 記憶Noがない場合はスキップ（初回ログインなど）
        console.log('[DEBUG] 記憶Noがありません。user:', user);
        return;
    }

    const lastSeenId = Number(user.lastSeenId);
    const currentMaxId = allData.length > 0
        ? Math.max(...allData.map(item => Number(item.id)))
        : 0;

    console.log('[DEBUG] 記憶No:', lastSeenId, '現在の最大ID:', currentMaxId);

    if (currentMaxId > lastSeenId) {
        // 新規データを抽出
        const newItems = allData.filter(item => Number(item.id) > lastSeenId);
        console.log('[DEBUG] 新規データ:', newItems.length, '件', newItems.map(item => item.id));

        // 職場コードでフィルタリング
        const myWorkplace = user.workplaceCode;
        const relevantItems = newItems.filter(item => {
            if (!myWorkplace || myWorkplace === 'all') return true;

            // 複合コード対応
            if (myWorkplace === 'AC') {
                return item.distributionCode === 'A' || item.distributionCode === 'C';
            }
            if (myWorkplace === 'PH') {
                return item.distributionCode === 'P' || item.distributionCode === 'H';
            }

            return item.distributionCode === myWorkplace;
        });

        if (relevantItems.length > 0) {
            // 通知を保留し、ウェルカムモーダルのOKボタン押下時に実行する
            window.pendingInitialNotifications = relevantItems;
            console.log('Initial notifications deferred until user interaction.');
        }

        // 新規データのIDリストを記録（NEWバッジ表示用）フィルタリング済みのデータのみ
        relevantItems.forEach(item => window.newItemIds.add(String(item.id)));
        // sessionStorageに保存（ページリロード対応）
        saveNewItemIds();
    }
}

/**
 * 記憶Noをサーバーに更新
 */
async function updateLastSeenIdToServer() {
    const user = Auth.getUser();
    if (!user || allShiftData.length === 0) return;

    const currentMaxId = Math.max(...allShiftData.map(item => Number(item.id)));

    // 同期処理
    try {
        console.log('Syncing lastSeenId to server:', currentMaxId);
        const result = await updateLastSeenId(user.id, currentMaxId);
        if (result.success) {
            console.log('記憶Noを更新しました:', currentMaxId);
            // セッション内の値も更新
            user.lastSeenId = currentMaxId;
            const session = Auth.getSession();
            if (session) {
                Auth.setSession(user, session.token);
            }
            // NEWバッジはユーザー操作（カード展開 or 全て既読ボタン）でのみクリア
        }
    } catch (error) {
        console.error('Failed to update lastSeenId:', error);
        // エラーは握りつぶす（通知更新の失敗は致命的ではない）
    }
}

