import test from "node:test";
import assert from "node:assert/strict";
import { sendNotification } from "../output_apps/msteam/sendnoti.js";

const teamsPayload = { type: "message", attachments: [] };

async function withEnvironment(values, callback) {
  const previous = new Map();
  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("uses a supplied generic routing destination", async () => {
  await withEnvironment({ MSTEAM_WEBHOOK_URL: "https://generic.example/webhook" }, async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl;
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200 };
    };
    try {
      const result = await sendNotification(teamsPayload, {
        webhookUrl: "https://routed.example/webhook"
      });
      assert.equal(requestedUrl, "https://routed.example/webhook");
      assert.deepEqual(result, { status: "delivered", httpStatus: 200 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("does not fall back to generic webhook when routing destination is missing", async () => {
  await withEnvironment({ MSTEAM_WEBHOOK_URL: "https://generic.example/webhook" }, async () => {
    await assert.rejects(
      () => sendNotification(teamsPayload, { webhookUrl: undefined }),
      /routing.webhookUrl is not configured/
    );
  });
});

test("uses generic webhook when routing metadata is absent", async () => {
  await withEnvironment({ MSTEAM_WEBHOOK_URL: "https://generic.example/webhook" }, async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl;
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return { ok: true, status: 202 };
    };
    try {
      const result = await sendNotification(teamsPayload);
      assert.equal(requestedUrl, "https://generic.example/webhook");
      assert.deepEqual(result, { status: "delivered", httpStatus: 202 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("rejects invalid routing destination URLs", async () => {
  await assert.rejects(
    () => sendNotification(teamsPayload, { webhookUrl: "not-a-url" }),
    /routing.webhookUrl must be a valid URL/
  );
});
