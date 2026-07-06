// Bean-Hoarder 시트 업로드 수신기 (Google Apps Script)
//
// 설치 (시트마다 1회, 약 2분):
// 1. 내 원두 시트 열기 → 확장 프로그램 → Apps Script
// 2. 기본 코드를 지우고 이 파일 전체를 붙여넣기 → 저장
// 3. 배포 → 새 배포 → 유형: 웹 앱
//    - 실행 계정: 나
//    - 액세스 권한: 모든 사용자   ← 중요 (URL을 아는 사람만 호출 가능)
// 4. 발급된 웹 앱 URL(…/exec)을 admin.html의 "업로드 URL"에 붙여넣기
//
// admin.html이 JSON 한 건을 POST하면 첫 번째 시트에 행으로 추가한다.
// KEY가 이미 있으면 중복으로 거절한다.

var HEADERS = ["KEY","ROASTERY","ORIGIN","REGION","VARIETY","PROCESS","ALTITUDE",
  "HARVEST","ROAST_DATE","PACKAGE_DATE","NET_WEIGHT","AGTRON","TASTING_NOTE","SOURCE_URL"];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var key = String(data.KEY || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}\d{2}-\d{3}$/.test(key)) {
      return out({ ok: false, error: "KEY 형식 오류: " + key });
    }
    if (!String(data.ROASTERY || "").trim()) {
      return out({ ok: false, error: "ROASTERY는 필수" });
    }
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    }
    var existing = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0]).trim().toUpperCase() === key) {
        return out({ ok: false, error: "중복 KEY: " + key });
      }
    }
    sheet.appendRow(HEADERS.map(function (h) { return data[h] || ""; }));
    return out({ ok: true, key: key });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
