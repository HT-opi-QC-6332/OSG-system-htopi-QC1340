/**
 * OSG - Google Apps Script
 * スプレッドシートからデータを取得し、JSON形式で返すWebアプリ
 */

/**
 * HTTP GETリクエストを処理する関数
 * @param {Object} e - イベントパラメータ
 * @return {ContentService.TextOutput} JSON形式のレスポンス
 */
function doGet(e) {
  try {
    // スプレッドシートとシートを取得
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('作業者交替管理一覧表');

    if (!sheet) {
      throw new Error('シート「作業者交替管理一覧表」が見つかりません');
    }

    // データ範囲を取得（3行目から最終行まで、A～W列の23列）
    const lastRow = sheet.getLastRow();

    // データが3行目より少ない場合は空配列を返す
    if (lastRow < 3) {
      return createJsonResponse({ data: [] });
    }

    const dataRange = sheet.getRange(3, 1, lastRow - 2, 23);
    const values = dataRange.getValues();

    // データをJSON形式に変換
    const jsonData = values
      .filter(row => row[0]) // No列が空でない行のみ
      .map(row => ({
        // 基本情報
        id: row[0],                          // a: No
        occurrenceDate: formatDate(row[1]),  // b: 作業者交替発生日
        changeLot: row[2] || '',             // c: 交替Lot
        targetLine: row[3] || '',            // d: 対象ライン
        completionProcess: row[4] || '',     // e: 完成工程
        partNumber: row[5] || '',            // f: 品番
        partName: row[6] || '',              // g: 品名
        newWorker: row[7] || '',             // h: 新任作業者
        quantity: row[8] || 0,               // i: 加工数量
        remarks: row[9] || '',               // j: 備考

        // 製造課記録欄
        educator: row[10] || '',             // k: 教育担当者
        confirmPerson: row[11] || '',        // l: 交替品確認者
        approver: row[12] || '',             // m: 交替承認者

        // 品質管理課記録欄
        standardEducation: row[13] || '',    // n: 標準書教育
        samplingInspection: row[14] || '',   // o: 抜取り検査
        inspectionResult: row[15] || '',     // p: 検査結果
        inspector: row[16] || '',            // q: 担当者

        // その他
        distributionCode: row[17] || '',     // r: 配信T (P/A/C)

        // ステータス管理列（数式で自動計算される列）
        mfgStatus: row[18] || '',            // s: ※（製造課未記入）
        mfgOverdue: row[19] || '',           // t: 発行未確認（製造課）
        qcStatus: row[20] || '',             // u: ※（品質管理課未記入）
        qcOverdue: row[21] || '',            // v: 発行未確認（品質管理課）
        completionStatus: row[22] || ''      // w: 完了 (T/C)
      }));

    // ConfigシートからAPIのURLを取得
    const apiUrl = getApiUrl();

    return createJsonResponse({
      data: jsonData,
      count: jsonData.length,
      timestamp: new Date().toISOString(),
      apiUrl: apiUrl  // 次回以降使用するURL
    });

  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    return createJsonResponse({
      error: error.toString(),
      timestamp: new Date().toISOString()
    }, 500);
  }
}

/**
 * 日付をISO形式の文字列に変換
 * @param {Date|string} dateValue - 日付値
 * @return {string} ISO形式の日付文字列
 */
function formatDate(dateValue) {
  if (!dateValue) return '';

  if (dateValue instanceof Date) {
    return Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd\'T\'HH:mm:ss');
  }

  return dateValue.toString();
}

/**
 * ConfigシートのH10セルからAPIのURLを取得
 * @return {string} API URL
 */
function getApiUrl() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName('Config');

    if (!configSheet) {
      Logger.log('Warning: Config sheet not found');
      return '';
    }

    const url = configSheet.getRange('H10').getValue();
    return url ? url.toString().trim() : '';
  } catch (error) {
    Logger.log('Error reading API URL from Config sheet: ' + error.toString());
    return '';
  }
}

/**
 * JSON形式のレスポンスを作成
 * @param {Object} data - レスポンスデータ
 * @param {number} statusCode - HTTPステータスコード（デフォルト: 200）
 * @return {ContentService.TextOutput} JSON形式のレスポンス
 */
function createJsonResponse(data, statusCode = 200) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);

  // CORS設定（必要に応じて特定のオリジンに制限）
  // 現段階では全許可、将来的に社内ドメインのみに制限可能
  return output;
}

/**
 * テスト用関数（Apps Scriptエディタで直接実行可能）
 */
function testDoGet() {
  const result = doGet();
  const content = result.getContent();
  const parsed = JSON.parse(content);

  Logger.log('Data count: ' + (parsed.data ? parsed.data.length : 0));
  Logger.log('First 3 records:');
  if (parsed.data && parsed.data.length > 0) {
    Logger.log(JSON.stringify(parsed.data.slice(0, 3), null, 2));
  }

  return parsed;
}
