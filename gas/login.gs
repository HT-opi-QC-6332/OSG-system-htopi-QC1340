/**
 * OSG Backend Script
 * ID: Code.gs (Unified)
 */

// ==========================================
// 設定エリア
// ==========================================

// メインのスプレッドシート（このスクリプトが紐づいているシート）
const MAIN_SS = SpreadsheetApp.getActiveSpreadsheet();

// 1. ユーザー管理スプレッドシートのID (Configシート H9)
function getUserSpreadsheetId() {
    const sheet = MAIN_SS.getSheetByName('Config');
    if (!sheet) throw new Error('Config sheet not found');
    return sheet.getRange('H9').getValue();
}

// 2. シート名設定
const DATA_SHEET_NAME = '作業者交替管理一覧表';
const USER_SHEET_NAME = 'ユーザー管理';

// 3. カラム設定を取得 (Config B4:B22)
// OperatorShift.gs の設定に準拠
function getColumnConfig() {
    const sheet = MAIN_SS.getSheetByName('Config');
    if (!sheet) throw new Error('Config sheet not found');

    // B4:B22 を取得
    const values = sheet.getRange('B4:B22').getValues().flat();

    return {
        dayTime: values[0],        // B4: 作業者交替発生日
        lotNo: values[1],          // B5: 交替Lot
        lineName: values[2],       // B6: 対象ライン
        brktNo: values[3],         // B7: 品番
        brktName: values[4],       // B8: 品名
        manName: values[5],        // B9: 新任作業者
        volume: values[6],         // B10: 加工数量
        trainer: values[7],        // B11: 教育担当者 (Mfg)
        approver: values[8],       // B12: 交替承認者 (Mfg)
        stdManual: values[9],      // B13: 標準書教育 (QC)
        prodInsp: values[10],      // B14: 抜取り検査 (QC)
        inspResult: values[11],    // B15: 検査結果 (QC)
        inspector: values[12],     // B16: 担当者 (QC)
        confirmPerson: values[13], // B17: 交替品確認者 (Mfg)
        // B18, B19 skip
        wpCode: values[16],        // B20: 職場コード
        warning: values[17],       // B21: 警告トリガー
        finProcess: values[18]     // B22: 完成工程
    };
}

// ==========================================

// --- Web API ハンドラ ---

function doGet(e) {
    return handleRequest(e);
}

function doPost(e) {
    return handleRequest(e);
}

function handleRequest(e) {
    // CORS対策 & 排他制御
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    try {
        const params = e.parameter;
        const action = params.action || 'getData'; // デフォルトはデータ取得

        let result = {};

        if (action === 'getData') {
            result = getShiftData(params.userId);
        } else if (action === 'login') {
            result = loginUser(params.userId, params.password);
        } else if (action === 'changePassword') {
            result = changePassword(params.userId, params.oldPassword, params.newPassword);
        } else if (action === 'updateData') {
            // updateDataには、id, section, data(JSON string) が必要
            const updateDataObj = JSON.parse(params.data || '{}');
            result = updateData(params.id, params.section, updateDataObj);
        } else if (action === 'updateLastSeenId') {
            result = updateLastSeenId(params.userId, params.lastSeenId);
        } else {
            throw new Error('Invalid action: ' + action);
        }

        return createJsonResponse(result);

    } catch (error) {
        return createJsonResponse({ error: error.toString() });
    } finally {
        lock.releaseLock();
    }
}

// --- 認証・ユーザー管理関数 ---

function getUserSheet() {
    const id = getUserSpreadsheetId();
    if (!id) throw new Error('ユーザー管理スプレッドシートIDがConfigシート(H9)に設定されていません。');
    return SpreadsheetApp.openById(id).getSheetByName(USER_SHEET_NAME);
}

function loginUser(userId, password) {
    const sheet = getUserSheet();
    if (!sheet) throw new Error('User sheet not found');

    const data = sheet.getDataRange().getValues();
    // 1行目はヘッダーなのでスキップ
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const dbUser = row[0];
        const dbPass = row[1];

        // パスワード照合
        if (String(dbUser) === String(userId) && String(dbPass) === String(password)) {
            // ログイン日時更新 (F列=6列目と想定)
            const now = new Date();
            sheet.getRange(i + 1, 6).setValue(now);

            return {
                success: true,
                user: {
                    id: dbUser,
                    name: row[2],
                    role: row[3],
                    workplaceCode: row[4] || '', // 担当職場コード (P, A, C, all)
                    lastSeenId: row[6] || 0 // G列: 記憶No
                },
                token: Utilities.getUuid()
            };
        }
    }

    return { success: false, message: 'IDまたはパスワードが間違っています' };
}

function changePassword(userId, oldPassword, newPassword) {
    const sheet = getUserSheet();
    if (!sheet) throw new Error('User sheet not found');

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (String(row[0]) === String(userId)) {
            if (String(row[1]) !== String(oldPassword)) {
                return { success: false, message: '現在のパスワードが正しくありません' };
            }

            // 新しいパスワードを設定
            sheet.getRange(i + 1, 2).setValue(newPassword);
            return { success: true, message: 'パスワードを変更しました' };
        }
    }
    return { success: false, message: 'ユーザーが見つかりません' };
}

function updateLastSeenId(userId, lastSeenId) {
    const sheet = getUserSheet();
    if (!sheet) throw new Error('User sheet not found');

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (String(row[0]) === String(userId)) {
            // G列（7列目）に記憶Noを設定
            sheet.getRange(i + 1, 7).setValue(Number(lastSeenId));
            return { success: true, message: '記憶Noを更新しました' };
        }
    }
    return { success: false, message: 'ユーザーが見つかりません' };
}

// --- データ取得・更新関数 ---

function getShiftData(userId = null) {
    const sheet = MAIN_SS.getSheetByName(DATA_SHEET_NAME);
    if (!sheet) throw new Error('シート「' + DATA_SHEET_NAME + '」が見つかりません');

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) {
        return { data: [], count: 0 };
    }

    const config = getColumnConfig();

    // 全データを取得
    // 注: データ範囲はカラム位置が動的になったため、安全を見て十分な列数を取得するか、getDataRangeを使う
    // 列番号の最大値を求めて、そこまで取得するのが効率的だが、
    // ここではシンプルに getDataRange で全列取得し、列インデックスでアクセスする
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    // 3行目以降がデータ (index 2)
    const dataRows = values.slice(2);

    // データをJSON形式に変換
    const jsonData = dataRows
        .filter(row => row[0]) // No列 (Column A, index 0) が空でない行のみ
        .map(row => {
            // ヘルパー: 列番号(1-based) から 配列インデックス(0-based) へ変換
            const getVal = (colNum) => {
                if (!colNum) return '';
                const idx = colNum - 1;
                return (idx >= 0 && idx < row.length) ? row[idx] : '';
            };

            return {
                // 基本情報
                id: row[0], // A列はNoで固定と仮定
                occurrenceDate: formatDate(getVal(config.dayTime)),
                changeLot: getVal(config.lotNo),
                targetLine: getVal(config.lineName),
                completionProcess: getVal(config.finProcess),
                partNumber: getVal(config.brktNo),
                partName: getVal(config.brktName),
                newWorker: getVal(config.manName),
                quantity: getVal(config.volume),
                remarks: row[9] || '', // 備考はConfingに無いため J列(index 9)固定のまま維持

                // 製造課記録欄
                educator: getVal(config.trainer),
                confirmPerson: getVal(config.confirmPerson),
                approver: getVal(config.approver),

                // 品質管理課記録欄
                standardEducation: getVal(config.stdManual),
                samplingInspection: getVal(config.prodInsp),
                inspectionResult: getVal(config.inspResult),
                inspector: getVal(config.inspector),

                // その他
                distributionCode: getVal(config.wpCode),

                // ステータス管理列 (Config.warning から始まる5列: S, T, U, V, W)
                mfgStatus: getVal(Number(config.warning)),          // +0 [S]
                mfgOverdue: getVal(Number(config.warning) + 1),     // +1 [T]
                qcStatus: getVal(Number(config.warning) + 2),       // +2 [U]
                qcOverdue: getVal(Number(config.warning) + 3),      // +3 [V]
                completionStatus: getVal(Number(config.warning) + 4) // +4 [W]
            };
        });

    const apiUrl = getApiUrl();

    // ユーザー設定値の取得（userIdが指定されている場合）
    let userSettings = {};
    if (userId) {
        try {
            const userSheet = getUserSheet();
            const uData = userSheet.getDataRange().getValues();
            for (let i = 1; i < uData.length; i++) {
                if (String(uData[i][0]) === String(userId)) {
                    userSettings = {
                        lastSeenId: uData[i][6] || 0, // G列
                        workplaceCode: uData[i][4] || '' // E列: 担当職場
                    };
                    break;
                }
            }
        } catch (e) {
            console.error('Failed to fetch user settings', e);
        }
    }

    return {
        data: jsonData,
        count: jsonData.length,
        timestamp: new Date().toISOString(),
        apiUrl: apiUrl,
        userSettings: userSettings // 追加
    };
}

function updateData(id, section, data) {
    const sheet = MAIN_SS.getSheetByName(DATA_SHEET_NAME);
    if (!sheet) throw new Error('Sheet not found');

    const config = getColumnConfig();

    // ID (No列=A列) で行を検索
    // データ量が多い場合はTextFinder等が高速だが、数千行程度ならループで十分安全
    const lastRow = sheet.getLastRow();
    const noColumnVals = sheet.getRange(3, 1, lastRow - 2, 1).getValues().flat(); // No列のみ取得

    const rowIndexInArray = noColumnVals.findIndex(val => String(val) === String(id));

    if (rowIndexInArray === -1) {
        return { success: false, message: '指定されたIDのデータが見つかりません (ID: ' + id + ')' };
    }

    const targetRow = 3 + rowIndexInArray; // ヘッダー2行分 + index

    // 更新処理
    if (section === 'mfg') {
        if (data.educator !== undefined) sheet.getRange(targetRow, config.trainer).setValue(data.educator);
        if (data.confirmPerson !== undefined) sheet.getRange(targetRow, config.confirmPerson).setValue(data.confirmPerson);
        if (data.approver !== undefined) sheet.getRange(targetRow, config.approver).setValue(data.approver);
    } else if (section === 'qc') {
        if (data.standardEducation !== undefined) sheet.getRange(targetRow, config.stdManual).setValue(data.standardEducation);
        if (data.samplingInspection !== undefined) sheet.getRange(targetRow, config.prodInsp).setValue(data.samplingInspection);
        if (data.inspectionResult !== undefined) sheet.getRange(targetRow, config.inspResult).setValue(data.inspectionResult);
        if (data.inspector !== undefined) sheet.getRange(targetRow, config.inspector).setValue(data.inspector);
    } else {
        return { success: false, message: 'Invalid section' };
    }

    return { success: true, message: '更新しました' };
}

// --- ヘルパー関数 ---

function formatDate(dateValue) {
    if (!dateValue) return '';
    if (dateValue instanceof Date) {
        return Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd\'T\'HH:mm:ss');
    }
    return dateValue.toString();
}

function getApiUrl() {
    try {
        const configSheet = MAIN_SS.getSheetByName('Config');
        if (!configSheet) return '';
        const url = configSheet.getRange('H10').getValue();
        return url ? url.toString().trim() : '';
    } catch (error) {
        return '';
    }
}

function createJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}
