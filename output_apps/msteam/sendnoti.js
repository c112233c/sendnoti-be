/**
 * Microsoft Teams webhook delivery adapter.
 * Accepts either Adaptive Card attachments or an HTML text payload.
 * Routing metadata is supplied by the project formatter when needed.
 */
export async function sendNotification(teamsPayload, routing) {
  const hasRouting = routing !== undefined && routing !== null;
  const webhookUrl = hasRouting ? routing.webhookUrl : process.env.MSTEAM_WEBHOOK_URL;
  const webhookName = hasRouting ? "routing.webhookUrl" : "MSTEAM_WEBHOOK_URL";

  if (typeof webhookUrl !== "string" || !webhookUrl.trim()) {
    throw new Error(webhookName + " is not configured");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    throw new Error(webhookName + " must be a valid URL");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error(webhookName + " must use HTTPS");
  }

  const hasAttachments = teamsPayload && typeof teamsPayload === "object" &&
    Array.isArray(teamsPayload.attachments);
  const hasHtmlText = teamsPayload && typeof teamsPayload === "object" &&
    typeof teamsPayload.text === "string" && teamsPayload.text.trim().length > 0;
  if (!hasAttachments && !hasHtmlText) {
    throw new Error("Formatter must return a Teams payload with attachments or non-empty HTML text");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(teamsPayload),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error("Microsoft Teams webhook returned HTTP " + response.status);
  }
  return {
    status: "delivered",
    httpStatus: response.status
  };
}
