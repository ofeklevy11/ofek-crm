const http = require("http");
const https = require("https");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const PORT = 9095;
const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  WEBHOOK_SECRET,
  GRAFANA_URL = "https://monitoring.bizlycrm.com",
  ENABLE_AUTO_REMEDIATION = "false",
} = process.env;

const SEVERITY_EMOJI = { critical: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
const RESOLVED_EMOJI = "\u{1F7E2}";

const PLAYBOOK_MAP = {
  HighCpuUsage: "high-cpu.sh",
  CriticalCpuUsage: "high-cpu.sh",
  HighMemoryUsage: "high-memory.sh",
  CriticalMemoryUsage: "high-memory.sh",
  HighErrorRate: "high-error-rate.sh",
  DiskSpaceLow: "disk-full.sh",
  DiskSpaceCritical: "disk-full.sh",
  AppDown: "app-down.sh",
};

function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[webhook-receiver] Telegram not configured, skipping:", text);
    return Promise.resolve();
  }

  const payload = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
          else reject(new Error(`Telegram API error ${res.statusCode}: ${body}`));
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function runPlaybook(alertname, severity) {
  const script = PLAYBOOK_MAP[alertname];
  if (!script) return null;

  const level = severity === "critical" ? "3" : "2";
  const playbookPath = `/playbooks/${script}`;

  try {
    const { stdout, stderr } = await execFileAsync("bash", [playbookPath, level], {
      timeout: 60_000,
      env: {
        ...process.env,
        PLAYBOOK_LEVEL: level,
        ALERT_NAME: alertname,
        ALERT_SEVERITY: severity,
      },
    });
    return { success: true, output: (stdout || "").slice(0, 1000), stderr: (stderr || "").slice(0, 500) };
  } catch (err) {
    return { success: false, output: err.message.slice(0, 1000) };
  }
}

function formatAlert(alert) {
  const status = alert.status;
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};
  const severity = labels.severity || "info";
  const emoji = status === "resolved" ? RESOLVED_EMOJI : (SEVERITY_EMOJI[severity] || SEVERITY_EMOJI.info);
  const statusText = status === "resolved" ? "RESOLVED" : "FIRING";
  const dashboardLink = annotations.dashboard ? `${GRAFANA_URL}${annotations.dashboard}` : GRAFANA_URL;

  let msg = `${emoji} <b>${statusText}: ${labels.alertname || "Unknown"}</b>\n`;
  msg += `Server: bizlycrm.com | Severity: ${severity}\n`;
  if (annotations.description) msg += `${annotations.description}\n`;
  if (annotations.action) msg += `\u{1F4A1} Action: ${annotations.action}\n`;
  msg += `\u{1F517} <a href="${dashboardLink}">Dashboard</a>`;

  return msg;
}

async function handleAlert(body) {
  const alerts = body.alerts || [];
  const results = [];

  for (const alert of alerts) {
    const message = formatAlert(alert);

    try {
      await sendTelegram(message);
    } catch (err) {
      console.error("[webhook-receiver] Failed to send Telegram:", err.message);
    }

    // Run playbook for firing alerts only
    if (alert.status === "firing" && ENABLE_AUTO_REMEDIATION === "true") {
      const alertname = (alert.labels || {}).alertname;
      const severity = (alert.labels || {}).severity || "info";
      const result = await runPlaybook(alertname, severity);

      if (result) {
        const statusEmoji = result.success ? "\u2705" : "\u274C";
        const playbookMsg = `${statusEmoji} <b>Playbook: ${PLAYBOOK_MAP[alertname]}</b>\n` +
          `Alert: ${alertname} | Level: ${severity === "critical" ? "3 (Remediate)" : "2 (Diagnose)"}\n` +
          `<pre>${result.output}</pre>`;

        try {
          await sendTelegram(playbookMsg);
        } catch (err) {
          console.error("[webhook-receiver] Failed to send playbook result:", err.message);
        }
        results.push({ alertname, ...result });
      }
    }
  }

  return results;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Test Telegram
  if (req.method === "POST" && req.url === "/test") {
    try {
      await sendTelegram("\u{1F6CE}\uFE0F <b>Test Alert</b>\nWebhook receiver is working!\nServer: bizlycrm.com");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "sent" }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Alert webhook
  if (req.method === "POST" && req.url === "/alert") {
    // Auth check
    const secret = req.headers["x-webhook-secret"];
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    try {
      const body = JSON.parse(await readBody(req));
      const results = await handleAlert(body);

      // Audit log
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: "alert_processed",
        alertCount: (body.alerts || []).length,
        playbookResults: results,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", processed: (body.alerts || []).length }));
    } catch (err) {
      console.error("[webhook-receiver] Error processing alert:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error" }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`[webhook-receiver] Listening on port ${PORT}`);
  console.log(`[webhook-receiver] Auto-remediation: ${ENABLE_AUTO_REMEDIATION}`);
});
