/**
 * OSG Backend Script (Unified)
 * handles Web API requests for the OSG application.
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
function getColumnConfig() {
  const sheet = MAIN_SS.getSheetByName('Config');
  if (!sheet) throw new Error('Config sheet not found');

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
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const params = e.parameter;
    const action = params.action || 'getData';

    let result = {};

    if (action === 'getData') {
      result = getShiftData(params.userId);
    } else if (action === 'login') {
      result = loginUser(params.userId, params.password);
    } else if (action === 'changePassword') {
      result = changePassword(params.userId, params.oldPassword, params.newPassword);
    } else if (action === 'updateData') {
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
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]) === String(userId) && String(row[1]) === String(password)) {
      const now = new Date();
      sheet.getRange(i + 1, 6).setValue(now);

      return {
        success: true,
        user: {
          id: row[0],
          name: row[2],
          role: row[3],
          workplaceCode: row[4] || '',
          lastSeenId: row[6] || 0
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
  if (lastRow < 3) return { data: [], count: 0 };

  const config = getColumnConfig();
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const dataRows = values.slice(2);

  const jsonData = dataRows
    .filter(row => row[0])
    .map(row => {
      const getVal = (colNum) => {
        const idx = colNum - 1;
        return (idx >= 0 && idx < row.length) ? row[idx] : '';
      };

      return {
        id: row[0],
        occurrenceDate: formatDate(getVal(config.dayTime)),
        changeLot: getVal(config.lotNo),
        targetLine: getVal(config.lineName),
        completionProcess: getVal(config.finProcess),
        partNumber: getVal(config.brktNo),
        partName: getVal(config.brktName),
        newWorker: getVal(config.manName),
        quantity: getVal(config.volume),
        remarks: row[9] || '',
        educator: getVal(config.trainer),
        confirmPerson: getVal(config.confirmPerson),
        approver: getVal(config.approver),
        standardEducation: getVal(config.stdManual),
        samplingInspection: getVal(config.prodInsp),
        inspectionResult: getVal(config.inspResult),
        inspector: getVal(config.inspector),
        distributionCode: getVal(config.wpCode),
        mfgStatus: getVal(Number(config.warning)),
        mfgOverdue: getVal(Number(config.warning) + 1),
        qcStatus: getVal(Number(config.warning) + 2),
        qcOverdue: getVal(Number(config.warning) + 3),
        completionStatus: getVal(Number(config.warning) + 4)
      };
    });

  let userSettings = {};
  if (userId) {
    try {
      const userSheet = getUserSheet();
      const uData = userSheet.getDataRange().getValues();
      for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]) === String(userId)) {
          userSettings = {
            lastSeenId: uData[i][6] || 0,
            workplaceCode: uData[i][4] || ''
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
    apiUrl: getApiUrl(),
    userSettings: userSettings
  };
}

function updateData(id, section, data) {
  const sheet = MAIN_SS.getSheetByName(DATA_SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found');

  const config = getColumnConfig();
  const lastRow = sheet.getLastRow();
  const noColumnVals = sheet.getRange(3, 1, lastRow - 2, 1).getValues().flat();
  const rowIndexInArray = noColumnVals.findIndex(val => String(val) === String(id));

  if (rowIndexInArray === -1) throw new Error('ID not found: ' + id);

  const targetRow = 3 + rowIndexInArray;

  if (section === 'mfg') {
    if (data.educator !== undefined) sheet.getRange(targetRow, config.trainer).setValue(data.educator);
    if (data.confirmPerson !== undefined) sheet.getRange(targetRow, config.confirmPerson).setValue(data.confirmPerson);
    if (data.approver !== undefined) sheet.getRange(targetRow, config.approver).setValue(data.approver);
  } else if (section === 'qc') {
    if (data.standardEducation !== undefined) sheet.getRange(targetRow, config.stdManual).setValue(data.standardEducation);
    if (data.samplingInspection !== undefined) sheet.getRange(targetRow, config.prodInsp).setValue(data.samplingInspection);
    if (data.inspectionResult !== undefined) sheet.getRange(targetRow, config.inspResult).setValue(data.inspectionResult);
    if (data.inspector !== undefined) sheet.getRange(targetRow, config.inspector).setValue(data.inspector);
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
