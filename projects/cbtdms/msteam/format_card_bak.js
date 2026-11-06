/**
 * CBTDMS-specific Microsoft Teams Adaptive Card formatter.
 * The source payload is produced by cbevent.
 */

function requiredText(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    const error = new Error("Missing required field: " + field);
    error.code = "INVALID_EVENT";
    throw error;
  }
  return String(value);
}

function statusColor(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "close") return "Warning";
  if (value === "open") return "Good";
  if (value === "lockout") return "Attention";
  return "Default";
}

function statusContainerStyle(status) {
  const color = statusColor(status);
  if (color === "Attention") return "attention";
  if (color === "Warning") return "warning";
  if (color === "Good") return "good";
  return "emphasis";
}

function currentValue(value) {
  if (value === undefined || value === null || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function currentFact(label, value) {
  return {
    type: "Column",
    width: "stretch",
    items: [
      {
        type: "TextBlock",
        text: label,
        size: "Small",
        color: "Muted",
        horizontalAlignment: "Center"
      },
      {
        type: "TextBlock",
        text: value.toLocaleString("en-US") + " A",
        weight: "Bolder",
        size: "Large",
        horizontalAlignment: "Center",
        color: value > 0 ? "Attention" : "Default"
      }
    ]
  };
}

export function format(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const error = new Error("Payload must be an object.");
    error.code = "INVALID_EVENT";
    throw error;
  }

  requiredText(payload.source, "source");
  if (typeof payload.aoj_code !== "string" || !/^\d{7}$/.test(payload.aoj_code)) {
    const error = new Error("Invalid required field: aoj_code must be a 7-digit string.");
    error.code = "INVALID_EVENT";
    throw error;
  }
  const aojPrefix = payload.aoj_code.slice(0, 2);
  console.log(aojPrefix)
  const region = requiredText(payload.region, "region");
  const eventType = requiredText(payload.event_type, "event_type");

  const eventTypeColor = eventType.trim().toLowerCase() === "trip lockout" ? "Attention" : "Default";
  const event = payload.event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    const error = new Error("Missing required field: event");
    error.code = "INVALID_EVENT";
    throw error;
  }

  const deviceName = requiredText(event.device_name, "event.device_name");
  const operDate = requiredText(event.oper_date, "event.oper_date");
  const operTime = requiredText(event.oper_time, "event.oper_time");
  const eventStatus = requiredText(event.status, "event.status");
  requiredText(event.description, "event.description");
  const aojName = requiredText(payload.aoj_name, "aoj_name");

  if (payload.tdms_detail !== undefined && !Array.isArray(payload.tdms_detail)) {
    const error = new Error("tdms_detail must be an array.");
    error.code = "INVALID_EVENT";
    throw error;
  }

  const flt = payload.flt ?? {};
  if (typeof flt !== "object" || Array.isArray(flt)) {
    const error = new Error("flt must be an object.");
    error.code = "INVALID_EVENT";
    throw error;
  }

  const fltType = String(flt.flt_type ?? "").trim() || "ไม่สามารถระบุประเภท Fault ได้";
  const fltIa = currentValue(flt.flt_ia);
  const fltIb = currentValue(flt.flt_ib);
  const fltIc = currentValue(flt.flt_ic);
  const fltIn = currentValue(flt.flt_in);

  const details = (payload.tdms_detail ?? []).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      const error = new Error("tdms_detail[" + index + "] must be an object.");
      error.code = "INVALID_EVENT";
      throw error;
    }
    return {
      operDatetime: requiredText(item.oper_datetime, "tdms_detail[" + index + "].oper_datetime"),
      status: requiredText(item.status, "tdms_detail[" + index + "].status"),
      description: requiredText(item.description, "tdms_detail[" + index + "].description")
    };
  });

  const detailItems = details.length
    ? details.map((detail) => ({
        type: "Container",
        spacing: "Small",
        separator: true,
        items: [
          {
            type: "TextBlock",
            text: detail.description,
            wrap: true
          },
          {
            type: "ColumnSet",
            spacing: "None",
            columns: [
              {
                type: "Column",
                width: "stretch",
                items: [{
                  type: "TextBlock",
                  text: detail.status,
                  weight: "Bolder",
                  color: statusColor(detail.status),
                  wrap: true
                }]
              },
              {
                type: "Column",
                width: "auto",
                items: [{
                  type: "TextBlock",
                  text: detail.operDatetime,
                  size: "Small",
                  color: "Muted",
                  horizontalAlignment: "Right",
                  wrap: true
                }]
              }
            ]
          }
        ]
      }))
    : [{
        type: "TextBlock",
        text: "ไม่มีรายละเอียดเพิ่มเติม",
        isSubtle: true,
        wrap: true
      }];

  // Each section has its own ToggleVisibility target and starts collapsed.
  const faultCurrentHeader = {
    type: "Container",
    spacing: "Medium",
    style: "emphasis",
    items: [
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            verticalContentAlignment: "Center",
            items: [{
              type: "TextBlock",
              text: "Fault Analysis",
              weight: "Bolder",
              size: "Medium"
            }]
          },
          {
            type: "Column",
            width: "auto",
            verticalContentAlignment: "Center",
            items: [{
              type: "ActionSet",
              actions: [{
                type: "Action.ToggleVisibility",
                title: "แสดงรายละเอียด",
                targetElements: ["fault-analysis-details"]
              }]
            }]
          }
        ]
      }
    ]
  };

  const faultCurrentDetails = {
    type: "Container",
    id: "fault-analysis-details",
    isVisible: false,
    spacing: "Small",
    style: "emphasis",
    items: [
      {
        type: "TextBlock",
        text: fltType,
        weight: "Bolder",
        size: "Large",
        color: "Attention",
        wrap: true
      },
      {
        type: "ColumnSet",
        spacing: "Medium",
        columns: [
          currentFact("IA", fltIa),
          currentFact("IB", fltIb)
        ]
      },
      {
        type: "ColumnSet",
        spacing: "Small",
        columns: [
          currentFact("IC", fltIc),
          currentFact("IN", fltIn)
        ]
      }
    ]
  };

  const tdmsHeader = {
    type: "Container",
    spacing: "Medium",
    style: "emphasis",
    items: [{
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "stretch",
          verticalContentAlignment: "Center",
          items: [{
            type: "TextBlock",
            text: "รายละเอียดเหตุการณ์ (TDMS)",
            weight: "Bolder",
            size: "Medium",
            wrap: true
          }]
        },
        {
          type: "Column",
          width: "auto",
          verticalContentAlignment: "Center",
          items: [{
            type: "ActionSet",
            actions: [{
              type: "Action.ToggleVisibility",
              title: "แสดงรายละเอียด",
              targetElements: ["tdms-detail-items"]
            }]
          }]
        }
      ]
    }]
  };

  const tdmsDetails = {
    type: "Container",
    id: "tdms-detail-items",
    isVisible: false,
    spacing: "Small",
    items: detailItems
  };

  const teamsPayload = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          {
            type: "Container",
            // style: statusContainerStyle(eventStatus),
            style: "emphasis",
            bleed: true,
            items: [{
              type: "RichTextBlock",
              inlines: [
                {
                  type: "TextRun",
                  text: deviceName + " " + String.fromCharCode(8226) + " ",
                  weight: "Bolder",
                  size: "Large"
                },
                {
                  type: "TextRun",
                  text: eventType,
                  weight: "Bolder",
                  size: "Large",
                  color: eventTypeColor
                }
              ]
            }]
          },
          {
            type: "FactSet",
            facts: [
              { title: "Region", value: region.toUpperCase() },
              { title: "Device", value: deviceName },
              { title: "Date", value: operDate },
              { title: "Time", value: operTime },
              { title: "หน่วยงาน", value: aojName }
            ]
          },
          faultCurrentHeader,
          faultCurrentDetails,
          tdmsHeader,
          tdmsDetails
        ]
      }
    }]
  };

  const webhookUrl = process.env["MSTEAM_CBTDMS_WEBHOOK_URL_" + aojPrefix];

  return {
    payload: teamsPayload,
    routing: { webhookUrl }
  };
}
