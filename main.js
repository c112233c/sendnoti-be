import express from "express";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { isTrustedAddress } from "./src/trusted-network.js";

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3001", 10);
const projectRoot = path.join(here, "projects");
const outputRoot = path.join(here, "output_apps");
const trustedNetworks = (process.env.TRUSTED_NETWORKS || "127.0.0.1/32,::1/128")
  .split(",").map((item) => item.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb", strict: true }));

// Do not trust X-Forwarded-For; the socket peer must be trusted.
app.use((req, res, next) => {
  if (!isTrustedAddress(req.socket.remoteAddress, trustedNetworks)) {
    console.log("NETWORK_NOT_TRUSTED:",req.socket.remoteAddress);
    return res.status(403).json({
      success: false,
      error: "NETWORK_NOT_TRUSTED",
      message: "Request source is not in the trusted network allowlist."
    });
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ success: true, service: "sendnoti-be", status: "ok" });
});

function isSafeSegment(value) {
  return typeof value === "string" && /^[a-z0-9_-]+$/i.test(value);
}

async function loadModule(root, segments, fileName) {
  const target = path.resolve(root, ...segments, fileName);
  const expectedPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!target.startsWith(expectedPrefix)) throw new Error("Invalid module path");
  return import(pathToFileURL(target).href);
}

app.post("/api/notify/:project/:app", async (req, res) => {
  const project = req.params.project;
  const outputApp = req.params.app;

  if (!isSafeSegment(project) || !isSafeSegment(outputApp)) {
    return res.status(400).json({ success: false, error: "INVALID_ROUTE_PARAMETER" });
  }
  if (!req.is("application/json")) {
    return res.status(415).json({
      success: false,
      error: "CONTENT_TYPE_UNSUPPORTED",
      message: "Content-Type must be application/json."
    });
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== "object") {
    return res.status(400).json({ success: false, error: "INVALID_PAYLOAD" });
  }

  try {
    const formatter = await loadModule(projectRoot, [project, outputApp], "format.js");
    const sender = await loadModule(outputRoot, [outputApp], "sendnoti.js");

    if (typeof formatter.format !== "function" || typeof sender.sendNotification !== "function") {
      return res.status(500).json({ success: false, error: "INVALID_NOTIFICATION_MODULE" });
    }

    let formatted;
    try {
      formatted = await formatter.format(req.body);
    } catch (error) {
      if (error?.code === "INVALID_EVENT") {
        return res.status(422).json({
          success: false, error: "INVALID_EVENT", message: error.message
        });
      }
      throw error;
    }

    if (!formatted || typeof formatted !== "object" || Array.isArray(formatted)) {
      return res.status(422).json({
        success: false,
        error: "INVALID_FORMAT_RESULT",
        message: "Formatter must return a notification payload object."
      });
    }

    const notificationPayload = formatted.payload ?? formatted;
    const routing = formatted.routing;
    const hasAttachments = notificationPayload && typeof notificationPayload === "object" &&
      !Array.isArray(notificationPayload) && Array.isArray(notificationPayload.attachments);
    const hasHtmlText = notificationPayload && typeof notificationPayload === "object" &&
      !Array.isArray(notificationPayload) && typeof notificationPayload.text === "string" &&
      notificationPayload.text.trim().length > 0;
    if (!hasAttachments && !hasHtmlText) {
      return res.status(422).json({
        success: false,
        error: "INVALID_FORMAT_RESULT",
        message: "Formatter payload must contain either a Teams attachments array or a non-empty text string."
      });
    }

    const result = await sender.sendNotification(notificationPayload, routing);
    return res.status(200).json({
      success: true, project, app: outputApp,
      message: "Notification sent", result
    });
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" || error?.code === "MODULE_NOT_FOUND") {
      return res.status(404).json({
        success: false, error: "NOTIFICATION_ROUTE_NOT_FOUND",
        message: "No formatter or output adapter is configured for this project/app."
      });
    }
    console.error("[sendnoti] Notification failed:", error?.message || error);
    return res.status(502).json({
      success: false, error: "OUTPUT_APP_ERROR",
      message: "The notification could not be delivered."
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "INVALID_JSON" });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ success: false, error: "PAYLOAD_TOO_LARGE" });
  }
  console.error("[sendnoti] Request failed:", error?.message || error);
  return res.status(500).json({ success: false, error: "INTERNAL_ERROR" });
});

app.listen(port, host, () => {
  console.log("sendnoti-be listening on http://" + host + ":" + port);
  console.log("Trusted networks: " + trustedNetworks.join(", "));
});
