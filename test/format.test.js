import test from "node:test";
import assert from "node:assert/strict";
import { format } from "../projects/cbtdms/msteam/format.js";

const samplePayload = {
  source: "cbevent",
  region: "ne1",
  event_type: "CIRCUIT BREAKER",
  event: {
    device_name: "BPU09VB-01",
    oper_date: "2026/11/03",
    oper_time: "14:31:32.059",
    status: "Open",
    description: "Circuit Breaker Status"
  },
  flt: {
    flt_type: "Single Line to GND",
    flt_ia: 6960,
    flt_ib: 12,
    flt_ic: 8,
    flt_in: 6950
  },
  tdms_detail: [
    { oper_datetime: "2026-11-03 14:31:49.545", status: "Value = 780.0531 A", description: "Fault Current Phase C" },
    { oper_datetime: "2026-11-03 14:31:36.244", status: "Close", description: "Circuit Breaker Status" },
    { oper_datetime: "2026-11-03 14:31:36.240", status: "Open", description: "Circuit Breaker Status" },
    { oper_datetime: "2026-11-03 14:31:36.236", status: "Trip", description: "E/F RELAY (EF)" }
  ],
  aoj_code: "0401301",
  aoj_name: "กฟส.บ้านผือ (S)"
};

test("formats event and fault data as name: value lines, keeping TDMS details in a table", () => {
  const result = format(samplePayload);
  const html = result.payload.text;

  assert.deepEqual(result.routing, { webhookUrl: undefined });
  assert.match(html, /<h3><b>BPU09VB-01 &bull; <span style="color:orange;">CIRCUIT BREAKER<\/span><\/b><\/h3>/);
  assert.match(html, /<b>Region:<\/b> NE1/);
  assert.match(html, /<b>Device:<\/b> BPU09VB-01/);
  assert.match(html, /<b>Date:<\/b> 2026\/11\/03/);
  assert.match(html, /<b>Time:<\/b> 14:31:32\.059/);
  assert.match(html, /<b>Status:<\/b> Open/);
  assert.match(html, /<b>Description:<\/b> Circuit Breaker Status/);
  assert.match(html, /<b>หน่วยงาน:<\/b> กฟส\.บ้านผือ \(S\)/);

  assert.match(html, /<b>Fault Type:<\/b> Single Line to GND/);
  assert.match(html, /<b>IA:<\/b> 6960 A/);
  assert.match(html, /<b>IB:<\/b> 12 A/);
  assert.match(html, /<b>IC:<\/b> 8 A/);
  assert.match(html, /<b>IN:<\/b> 6950 A/);

  // Only the TDMS detail section should use a table.
  assert.equal((html.match(/<table/g) ?? []).length, 1);
  assert.match(html, /2026-11-03 14:31:49\.545/);
  assert.match(html, /Fault Current Phase C/);
});

test("colors Trip Lockout red and other event types orange", () => {
  const lockout = format({ ...samplePayload, event_type: "Trip Lockout" }).payload.text;
  const other = format({ ...samplePayload, event_type: "Trip" }).payload.text;
  assert.match(lockout, /<span style="color:red;">Trip Lockout<\/span>/);
  assert.match(other, /<span style="color:orange;">Trip<\/span>/);
});

test("resolves project-specific webhook from the AOJ prefix", () => {
  const previous = process.env.MSTEAM_CBTDMS_WEBHOOK_URL_05;
  process.env.MSTEAM_CBTDMS_WEBHOOK_URL_05 = "https://aoj05.example/webhook";
  try {
    const result = format({ ...samplePayload, aoj_code: "0512345" });
    assert.deepEqual(result.routing, { webhookUrl: "https://aoj05.example/webhook" });
  } finally {
    if (previous === undefined) delete process.env.MSTEAM_CBTDMS_WEBHOOK_URL_05;
    else process.env.MSTEAM_CBTDMS_WEBHOOK_URL_05 = previous;
  }
});

test("escapes HTML special characters in event and TDMS values", () => {
  const result = format({
    ...samplePayload,
    event: { ...samplePayload.event, device_name: "<script>alert(1)</script>" },
    tdms_detail: [{
      oper_datetime: "2026-11-03 14:31:49.545",
      status: "Open & Close",
      description: "<img src=x>"
    }]
  });
  assert.match(result.payload.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(result.payload.text, /Open &amp; Close/);
  assert.match(result.payload.text, /&lt;img src=x&gt;/);
  assert.doesNotMatch(result.payload.text, /<script>|<img/);
});

test("supports an empty TDMS detail list", () => {
  const result = format({ ...samplePayload, tdms_detail: [] });
  assert.match(result.payload.text, /ไม่มีรายละเอียดเพิ่มเติม/);
  assert.equal((result.payload.text.match(/<table/g) ?? []).length, 0);
});

test("defaults missing fault-current values to zero", () => {
  const result = format({ ...samplePayload, flt: { flt_type: "Unknown" } });
  assert.match(result.payload.text, /<b>Fault Type:<\/b> Unknown/);
  assert.equal((result.payload.text.match(/<b>IA:<\/b> 0 A/g) ?? []).length, 1);
  assert.equal((result.payload.text.match(/<b>IB:<\/b> 0 A/g) ?? []).length, 1);
});

test("rejects missing required event fields", () => {
  assert.throws(
    () => format({ ...samplePayload, event: { ...samplePayload.event, device_name: "" } }),
    (error) => error.code === "INVALID_EVENT" && /event.device_name/.test(error.message)
  );
});

test("rejects malformed tdms_detail", () => {
  assert.throws(
    () => format({ ...samplePayload, tdms_detail: {} }),
    (error) => error.code === "INVALID_EVENT" && /tdms_detail must be an array/.test(error.message)
  );
});

test("rejects malformed flt", () => {
  assert.throws(
    () => format({ ...samplePayload, flt: [] }),
    (error) => error.code === "INVALID_EVENT" && /flt must be an object/.test(error.message)
  );
});

test("rejects aoj_code unless it is a 7-digit string", () => {
  for (const aojCode of ["512345", "051234", 5123456, "05A2345", null]) {
    assert.throws(
      () => format({ ...samplePayload, aoj_code: aojCode }),
      (error) => error.code === "INVALID_EVENT" && /aoj_code/.test(error.message)
    );
  }
});
