//作業者交替管理一覧表登録処理
//説明：チャットワークAPIを使用して、「作業者交替」のアナウンスがあった場合に、一覧表へ転記する。

function cwMessageTransfer() {
  try {
    //シートの定義付け
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cwSheet = ss.getSheetByName("CW転記");
    const idSheet = ss.getSheetByName('Config');
    const mcSheet = ss.getSheetByName("作業者交替管理一覧表");
    const listSheet = ss.getSheetByName("作業者交替発生件数");
    const mstSheet = ss.getSheetByName("マスター除外リスト"); //今後使用する可能性有り

    // 設定値取得（APIトークン・Room IDもConfigから取得）
    const [token, room_id] = idSheet.getRange("H6:H7").getValues().flat();
    if (!token || !room_id) {
      console.log("APIトークンまたはRoom IDが未設定です。");
      return;
    }

    //「テスト」環境でのトリガー解除
    const test = mcSheet.getRange("G1").getValue();

    if (test === "停止") {
      console.log("停止中の為、スキップします。");
      return;
    }

    //テスト環境下での処理は、曜日トリガーをスキップする。
    //本番環境下では、曜日・時間によるトリガー解除を行う。
    if (test !== "テスト") {
      // 日時指定によるトリガー解除
      const now = new Date();
      const day = now.getDay(); // 0=日, 1=月, ..., 6=土
      const hour = now.getHours(); // 0〜23

      if (day === 0 || hour < 8 || hour >= 21) {
        console.log("処理対象外の時間帯または曜日（日曜日）です。スキップします。");
        return;
      }
    }

    // 設定情報読み取り
    const messageUrl = 'https://api.chatwork.com/v2/rooms/' + room_id + '/messages?force=1';
    const json = {
      'x-chatworktoken': token
    };

    //チャットワーク情報取得
    const options = {
      'method': 'get',
      'headers': json,
    };

    let response;
    try {
      response = JSON.parse(UrlFetchApp.fetch(messageUrl, options).getContentText());
    } catch (apiError) {
      console.error("ChatWork API通信エラー:", apiError.message);
      return;
    }

    // レスポンスが空の場合は終了
    if (!response || response.length === 0) {
      console.log("新規メッセージはありませんでした。");
      return;
    }

    for (let i = 0; i < response.length; i++) {
      response[i] = [response[i].send_time, response[i].account.name, response[i].body];
    }

    //スプレッドシートへ転記
    cwSheet.getRange(2, 1, response.length, response[0].length).setValues(response);

    //管理表への追加
    const lastRow = cwSheet.getRange("A1").getNextDataCell(SpreadsheetApp.Direction.DOWN).getRow(); //転記元の最終行を確認、取得する。

    //『作業者交替管理一覧表』の必要情報読み取り列番号を取得する
    const configData = idSheet.getRange("B4:B22").getValues().flat(); //config情報を一括取得
    const [
      col_dayTime, //B4 = 作業者交替発生日の列番号
      col_lotNo, //B5 = 交替Lotの列番号
      col_lineName, //B6 = 対象ラインの列番号
      col_brktNo, //B7 = 品番の列番号
      col_brktName, //B8 = 品名の列番号
      col_manName, //B9 = 新任作業者の列番号
      col_volume, //B10 = 加工数量の列番号
      col_trainer, //B11 = 教育担当者の列番号
      col_approver, //B12 = 交替承認者の列番号
      col_result_workStandardManual, //B13 = 標準書教育有無の列番号
      col_productInspectionResult, //B14 = 抜取り検査の結果欄
      col_inspectionResult, //B15 = 検査結果の結果欄
      col_inspector, //B16 = 検査担当者の結果欄
      col_followUpPerson, //B17 = 交替品の確認者の列番号
      , //B18
      , //B19
      col_wpCode, //B20 = 職場コードの列番号 
      col_warning, //B21 = 警告トリガーの列番号
      col_finprocess //B22 = 完成工程の列番号
    ] = configData;

    const lastMessage_id = idSheet.getRange("B1").getValue();  //次の最終メッセージIDを取得して置く。

    const cwData = cwSheet.getDataRange().getValues(); //CW転記シートの全データを取得
    const mcData = mcSheet.getDataRange().getValues(); //作業者交替一覧表の全データを取得

    //作業者交替管理一覧表の更新前の最終行を取得しておく。（before_lastRow_mc)
    const before_lastRow_mc = mcSheet.getRange("B2").getNextDataCell(SpreadsheetApp.Direction.DOWN).getRow();

    //検索データのmapを作成。
    const existingMap = new Map();
    for (let i = 2; i < mcData.length; i++) {
      const row = mcData[i]; //No,作業者交替発生日,交替lot,ライン,品番,品名,作業者,数量,・・・
      const key = `${row[col_lotNo - 1]}_${row[col_lineName - 1]}_${row[col_brktNo - 1]}_${row[col_manName - 1]}`;
      //key = 交替lot,対象ライン,品番,新任作業者名　のデータ(値）を格納。

      existingMap.set(key, {
        resultA: row[col_result_workStandardManual - 1],
        resultB: row[col_productInspectionResult - 1],
        resultD: row[col_inspector - 1]
      }); //resultA = 作業標準書による教育監視結果, resultB = 抜取り検査結果, resultD = 検査担当者
    }

    //所得したmapデータを試用した、前回検査結果別の分岐処理 
    const insertRow = []; //空の配列を用意する。

    //『CW転記』の必要情報読み取り列番号を取得する
    const configCw = idSheet.getRange("E1:E16").getValues().flat(); //config情報を一括取得
    const [
      cw_col_msgID, //E1
      cw_col_acount, //E2
      cw_col_msg, //E3
      cw_col_triger, //E4
      cw_col_lotNo, //E5
      cw_col_dayTime, //E6
      cw_col_lineName, //E7
      cw_col_manName, //E8
      cw_col_brktNo, //E9
      cw_col_brktName, //E10
      cw_col_volume, //E11
      cw_col_machineCode, //E12
      cw_col_wpCode, //E13
      cw_col_notAppMan, //E14
      cw_col_notAppLine, //E15
      cw_col_finProcess //E16
    ] = configCw;

    for (let i = 1; i < cwData.length; i++) {
      const rowCw = cwData[i];

      //コンフィグ設定した列数を代入して、変数のセル設定
      const msgID = rowCw[cw_col_msgID - 1];  //CW転記の「投稿日時」の値取得
      const triger = rowCw[cw_col_triger - 1];  //CW転記の「取得T」の値取得
      const lotNo = rowCw[cw_col_lotNo - 1];  //CW転記の「ロット数」の値取得
      const dayTime = rowCw[cw_col_dayTime - 1];  //CW転記の「日時」の値取得
      const lineName = rowCw[cw_col_lineName - 1];  //CW転記の「ライン」の値取得
      const manName = rowCw[cw_col_manName - 1];  //CW転記の「作業者」の値取得
      const brktNo = rowCw[cw_col_brktNo - 1];  //CW転記の「品番」の値取得
      const brktName = rowCw[cw_col_brktName - 1];  //CW転記の「品名」の値取得
      const volume = rowCw[cw_col_volume - 1];  //CW転記の「数量」の値取得
      const wpCode = rowCw[cw_col_wpCode - 1];  //CW転記の「職場コード」の値取得
      const notAppMan = rowCw[cw_col_notAppMan - 1];  //CW転記の「作業者除外」の値取得
      const notAppLine = rowCw[cw_col_notAppLine - 1];  //CW転記の「工程除外」の値取得
      const finProcess = rowCw[cw_col_finProcess - 1];  //CW転記の「完成工程」の値取得

      if (msgID > lastMessage_id && triger === "T") {
        //転記時の記入の型を指定して置く。
        const row = [];
        row[col_dayTime - 1] = dayTime; //作業者交替発生日
        row[col_lotNo - 1] = lotNo; //交替lot
        row[col_lineName - 1] = lineName; //対象ライン
        row[col_finprocess - 1] = finProcess; //完成工程
        row[col_brktNo - 1] = brktNo; //品番
        row[col_brktName - 1] = brktName; //品名
        row[col_manName - 1] = manName; //新任作業者
        row[col_volume - 1] = volume; //加工数量
        row[col_wpCode - 1] = wpCode; //職場コード

        if (lotNo !== "1") { //転記する交替ロットが「1」では無い(2又は3）場合の処理
          const prevLot = lotNo - 1; //検索するロットNoは、記述するロットNo-1
          const key = `${prevLot}_${lineName}_${brktNo}_${manName}`; //key=(交替lot,対象ライン,品番,新任作業者名)
          const past = existingMap.get(key); //mapを参照

          //前回ロットの検査がOKであれば、転記時に検査記入項目をスキップさせる。
          if (past && past.resultA !== "NG" && past.resultA !== "" &&
            past.resultB !== "NG" && past.resultB !== "" &&
            past.resultD !== "") {

            row[col_result_workStandardManual - 1] = "-"; //作業標準書有無確認項目へ「-」記入
            row[col_productInspectionResult - 1] = "-"; //抜取り検査欄へ「-」記入
            row[col_inspectionResult - 1] = "前ロットで確認済の作業者交替です。";
            row[col_inspector - 1] = past.resultD; //前回の確認者の名前を取得 
          }
          //転記ロットが「1」では無い場合は、製造課記入欄の一部を「-」にする。
          row[col_trainer - 1] = "-"; //教育者欄
          row[col_approver - 1] = "-"; //承認者欄
        }

        //転記するデータが、「完成工程でない」・「作業者除外対象」・「除外対象工程」の場合の追加処理
        if (finProcess !== "◎" || notAppMan === "Fit" || notAppLine === "Fit") {

          row[col_result_workStandardManual - 1] = "-"; //作業標準書有無確認項目へ「-」を格納。
          row[col_productInspectionResult - 1] = "-"; //抜取り検査欄へ「-」を格納。
          row[col_inspector - 1] = "System"; //システムを記入者名に記載。 

          if (notAppLine === "Fit") {
            row[col_inspectionResult - 1] = "作業者交替フォロー対象外（単純工程の為、工程内保証とする。）"; //フォロー対象外とする。
          }
          if (notAppMan === "Fit") {
            row[col_inspectionResult - 1] = "作業者交替フォロー対象外（職場管理者による保証とする。）"; //フォロー対象外とする。
            row[col_trainer - 1] = "-"; //教育者欄
            row[col_approver - 1] = "-"; //承認者欄
            row[col_followUpPerson - 1] = "-"; //交替品確認者欄
          }
          if (finProcess !== "◎") {
            row[col_inspectionResult - 1] = "作業者交替フォロー対象外（途中工程の為）"; //フォロー対象外とする。
          }
        }
        insertRow.push(row); //転記データを配列データへ転換し、insertRowへ格納。
      }
    }

    //作業者交替一覧表へ、該当の配列データの転記を行う。
    const startRow = before_lastRow_mc + 1; //最終行を検索して、最終行+1行目を指定。
    for (let i = 0; i < insertRow.length; i++) {
      const fullRow = new Array(mcSheet.getLastColumn()).fill("");
      const partialRow = insertRow[i];

      for (let j = 0; j < partialRow.length; j++) {
        if (partialRow[j] !== undefined) {
          fullRow[j] = partialRow[j];
        }
      }

      const targetRange = mcSheet.getRange(startRow + i, 2, 1, fullRow.length - 1); //転記するｼｰﾄのA列を除く
      const sliceRow = fullRow.slice(1); //一覧表のA列を除いた行データ
      targetRange.setValues([sliceRow]);
    }

    //警告・判別トリガー式の設定
    for (let i = 0; i < insertRow.length; i++) {
      const rowIndex = startRow + i;
      const formulas = idSheet.getRange("H1:H5").getValues().flat();
      const rowFormulas = formulas.map(f => f.replace(/\[row\]/g, rowIndex));
      mcSheet.getRange(rowIndex, col_warning, 1, rowFormulas.length).setFormulas([rowFormulas]);
    }

    //転記処理、ここまで。

    //最終メッセージIDの更新（投稿日時）　※重複処理防止
    const lastMessage_id_Next = cwSheet.getRange(lastRow, 1).getValue();  //次の最終メッセージIDを取得して置く。
    idSheet.getRange("B1").setValue(lastMessage_id_Next);

    //一覧表のA列の最終行が、更新前より更新後が増えているかで、更新があったかどうかを判断させる。
    const after_lastRow_mc = mcSheet.getRange("B2").getNextDataCell(SpreadsheetApp.Direction.DOWN).getRow();
    const updateCount = after_lastRow_mc - before_lastRow_mc;

    if (updateCount > 0) {
      console.log("処理完了。新規登録件数: " + updateCount + "件");
    } else {
      console.log("更新はありませんでした。");
    }

  } catch (error) {
    console.error("処理中にエラーが発生しました:", error.message);
    console.error("スタックトレース:", error.stack);
  }
}