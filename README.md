# sendnoti-be

Internal notification gateway with project-specific Teams card formatting and reusable channel delivery adapters.

## Structure

    sendnoti-be/
    ├── main.js
    ├── src/trusted-network.js
    ├── projects/cbtdms/msteam/format.js
    ├── output_apps/msteam/sendnoti.js
    ├── test/
    ├── .env.example
    └── package.json

- `projects/<project>/<app>/format.js` validates source events and builds the destination-specific payload. For Teams, this module owns the complete Adaptive Card structure, colors, sections and layout.
- `output_apps/<app>/sendnoti.js` delivers the already-formatted payload. It does not impose a shared card layout.
- `main.js` exposes the HTTP API, checks trusted source networks and routes requests.

Each project can define its own card in `projects/<project>/msteam/format.js` while reusing `output_apps/msteam/sendnoti.js`.

## Requirements and setup

Requires Node.js 20.6+ and npm.

1. Run `npm install` in this directory.
2. Copy `.env.example` to `.env`.
3. Set `MSTEAM_WEBHOOK_URL` to a Microsoft Teams Workflows webhook URL.
4. Set `TRUSTED_NETWORKS` to the trusted client IP addresses/CIDRs. The default allows loopback only.
5. Set `HOST` and `PORT` as needed, then run `npm start`.

The npm start/dev scripts load `.env` using Node's `--env-file=.env` option. Do not commit the webhook URL or `.env`.

## Trusted network security

There is no API-key authentication. The application checks the socket peer IP against `TRUSTED_NETWORKS`; also enforce access using firewall/network policy. IPv4 CIDRs and exact IPv6 addresses are supported by the application allowlist. IPv6 subnet rules should currently be enforced by a firewall or reverse proxy. `X-Forwarded-For` is not trusted.

Example environment value for an internal IPv4 subnet:

    TRUSTED_NETWORKS=127.0.0.1/32,::1/128,10.20.30.0/24

## API

`GET /health`

`POST /api/notify/cbtdms/msteam`

Content-Type: `application/json`

Example request body (cbevent):

    {
      "source": "cbevent",
      "region": "ne1",
      "event": {
        "device_name": "BPU09VB-01",
        "oper_date": "2026/11/03",
        "oper_time": "14:31:32.059",
        "status": "Open",
        "description": "Circuit Breaker Status"
      },
      "tdms_detail": [
        {
          "oper_datetime": "2026-11-03 14:31:49.545",
          "status": "Value = 780.0531 A",
          "description": "Fault Current Phase C"
        }
      ],
      "aoj_code": "0401301",
      "aoj_name": "กฟส.บ้านผือ (S)"
    }

Required fields: `source`, `region`, all five fields under `event`, `aoj_code` and `aoj_name`. `tdms_detail` is optional; when supplied it must be an array of objects containing `oper_datetime`, `status` and `description`. The formatter preserves the supplied detail order and displays all entries.

Successful delivery returns HTTP 200 and JSON with `success: true`. Invalid event payloads return 422, unknown project/app combinations return 404, untrusted sources return 403, and delivery failures return 502.

## Current limitations

- The Teams adapter sends Adaptive Card message payloads to Teams Workflows webhooks; verify that your configured webhook accepts this format.
- Delivery is synchronous with a 10-second timeout. Durable queueing, retries, rate limiting and deduplication are not implemented yet.
