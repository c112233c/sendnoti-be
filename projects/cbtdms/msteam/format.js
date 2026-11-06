/**
 * CBTDMS-specific Microsoft Teams HTML message formatter.
 * The result is sent to a Power Automate workflow, which should use
 * triggerBody()?['text'] as the Message value of "Post message in a chat or channel".
 */

function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_EVENT";
  throw error;
}

function requiredText(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    invalid("Missing required field: " + field);
  }
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function currentValue(value) {
  if (value === undefined || value === null || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function htmlTable(headers, rows) {
  const headerHtml = headers.map((item) =>
    '<th style="text-align:left;padding:6px;border:1px solid #d1d5db;background-color:#f3f4f6;">' +
    escapeHtml(item) + "</th>"
  ).join("");
  const rowsHtml = rows.map((row) =>
    "<tr>" + row.map((item) =>
      '<td style="padding:6px;border:1px solid #d1d5db;">' +
      escapeHtml(item) + "</td>"
    ).join("") + "</tr>"
  ).join("");
  return '<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">' +
    "<thead><tr>" + headerHtml + "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";
}

function bulletItem(label, value) {
  return "<li><b>" + escapeHtml(label) + ":</b> " + escapeHtml(value) + "</li>";
}

export function format(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    invalid("Payload must be an object.");
  }

  requiredText(payload.source, "source");
  if (typeof payload.aoj_code !== "string" || !/^\d{7}$/.test(payload.aoj_code)) {
    invalid("Invalid required field: aoj_code must be a 7-digit string.");
  }

  const aojPrefix = payload.aoj_code.slice(0, 2);
  const region = requiredText(payload.region, "region").toUpperCase();
  const eventType = requiredText(payload.event_type, "event_type");
  const event = payload.event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    invalid("Missing required field: event");
  }

  const deviceName = requiredText(event.device_name, "event.device_name");
  const operDate = requiredText(event.oper_date, "event.oper_date");
  const operTime = requiredText(event.oper_time, "event.oper_time");
  const eventStatus = requiredText(event.status, "event.status");
  const eventDescription = requiredText(event.description, "event.description");
  const aojName = requiredText(payload.aoj_name, "aoj_name");

  if (payload.tdms_detail !== undefined && !Array.isArray(payload.tdms_detail)) {
    invalid("tdms_detail must be an array.");
  }

  const flt = payload.flt ?? {};
  if (!flt || typeof flt !== "object" || Array.isArray(flt)) {
    invalid("flt must be an object.");
  }

  const fltType = String(flt.flt_type ?? "").trim() || "ไม่สามารถระบุประเภท Fault ได้";
  const faultRows = [
    ["IA", currentValue(flt.flt_ia) + " A"],
    ["IB", currentValue(flt.flt_ib) + " A"],
    ["IC", currentValue(flt.flt_ic) + " A"],
    ["IN", currentValue(flt.flt_in) + " A"]
  ];

  const details = (payload.tdms_detail ?? []).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      invalid("tdms_detail[" + index + "] must be an object.");
    }
    return [
      requiredText(item.oper_datetime, "tdms_detail[" + index + "].oper_datetime"),
      requiredText(item.status, "tdms_detail[" + index + "].status"),
      requiredText(item.description, "tdms_detail[" + index + "].description")
    ];
  });

  const metadata = "<ul>" + [
    bulletItem("Region", region),
    bulletItem("Device", deviceName),
    bulletItem("Date", operDate),
    bulletItem("Time", operTime),
    bulletItem("Status", eventStatus),
    bulletItem("Description", eventDescription),
    bulletItem("หน่วยงาน", aojName)
  ].join("") + "</ul>";

  const faultAnalysis = "<ul>" + [
    bulletItem("Fault Type", fltType),
    ...faultRows.map(([phase, current]) => bulletItem(phase, current))
  ].join("") + "</ul>";

  const tdmsTable = details.length
    ? htmlTable(["เวลา", "สถานะ / ค่า", "รายละเอียด"], details)
    : "<p>ไม่มีรายละเอียดเพิ่มเติม</p>";

  const html = [
    '<h1><b>' + escapeHtml(deviceName) + " &bull; " + '<span style="color:' + (eventType === "Trip Lockout" ? "red" : "orange") + ';">' + escapeHtml(eventType) + "</span></b></h1>",
    "<p><b>ข้อมูลเหตุการณ์</b></p>",
    metadata,
    // "<p><b>Fault Analysis</b></p>",
    // faultAnalysis,
    "<p><b>รายละเอียดเหตุการณ์ (TDMS)</b></p>",
    tdmsTable
  ].join("");

  const webhookUrl = process.env["MSTEAM_CBTDMS_WEBHOOK_URL_" + aojPrefix];

  return {
    payload: { text: html },
    routing: { webhookUrl }
  };
}
