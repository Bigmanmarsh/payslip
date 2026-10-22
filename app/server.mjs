// Local web app for private payroll with signed payslips.
// Runs on the user's own machine and drives the Zcash CLI tools in bin/.
//
// Privacy rules for this server:
// - Viewing keys sent to /api/check are used once and never stored or logged.
// - Nothing about payments is written to disk by this server.
//
// Start: node app/server.mjs   (from the project root)

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import {
  buildPaymentRequest, loadEmployers, loadSigningKey, verifyPayments, zatToZec, zecToZat,
} from "../scripts/payslip.mjs";

const PORT = Number(process.env.PORT ?? 4321);
const EMPLOYER_ID = process.env.EMPLOYER_ID ?? "zecathon-test-co";
const EMPLOYER_WALLET = "wallets/employer";
const EMPLOYER_IDENTITY = "wallets/employer.age";
const DEVTOOL = "bin/zcash-devtool.exe";
const SCANNER = "bin/payslip-scan.exe";
const PUBLIC_DIR = "app/public";
// Demo worker wallets this machine holds, so the worker page can show a proof code.
const DEMO_WORKERS = ["worker", "worker2", "worker3"];

// ---------- helpers ----------

function run(cmd, args, { timeoutMs = 300000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

// The testnet server sometimes times out; retry network commands once.
async function runWithRetry(cmd, args, opts) {
  const first = await run(cmd, args, opts);
  if (first.code === 0 || !/transport error|tcp connect|timed out/i.test(first.out + first.err)) return first;
  return run(cmd, args, opts);
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

function friendlyError(res) {
  const text = stripAnsi(res.out + res.err);
  const line = text.split(/\r?\n/).find((l) => /^Error|InsufficientFunds|insufficient/i.test(l));
  return line?.trim() ?? "The Zcash tool failed. Check the server terminal for details.";
}

async function employerBalance() {
  await runWithRetry(DEVTOOL, ["wallet", "-w", EMPLOYER_WALLET, "sync"]);
  const res = await run(DEVTOOL, ["wallet", "-w", EMPLOYER_WALLET, "balance"]);
  const text = stripAnsi(res.out);
  const pick = (label) => text.match(new RegExp(`${label}:\\s+([0-9.]+) TAZ`))?.[1] ?? null;
  return { total: pick("Balance"), spendable: pick("Ironwood Spendable") };
}

async function walletInfo(walletDir) {
  const res = await run(DEVTOOL, ["wallet", "-w", walletDir, "list-accounts"]);
  const text = stripAnsi(res.out);
  return {
    name: text.match(/Name:\s+(.+)/)?.[1]?.trim(),
    uivk: text.match(/UIVK:\s+(\S+)/)?.[1],
    birthday: Number(text.match(/birthday height (\d+)/)?.[1]),
    address: (await run(DEVTOOL, ["wallet", "-w", walletDir, "list-addresses"])).out.match(/Default Address:\s+(\S+)/)?.[1],
  };
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "Add at least one person to pay.";
  if (rows.length > 50) return "This demo pays at most 50 people at once.";
  const ids = new Set();
  for (const [i, r] of rows.entries()) {
    const n = `Row ${i + 1}`;
    for (const k of ["id", "name", "address", "amount", "period"]) {
      if (!String(r[k] ?? "").trim()) return `${n}: ${k} is missing.`;
      if (/[|,\r\n]/.test(r[k])) return `${n}: ${k} cannot contain | or commas.`;
    }
    if (!/^(utest1|ztestsapling1)[0-9a-z]+$/.test(r.address)) return `${n}: address must be a shielded testnet address (utest1… or ztestsapling1…).`;
    try {
      if (zecToZat(r.amount) <= 0n) return `${n}: amount must be more than 0.`;
    } catch {
      return `${n}: amount must be a number like 0.05.`;
    }
    if (ids.has(r.id)) return `${n}: payslip number ${r.id} is used twice.`;
    ids.add(r.id);
  }
  return null;
}

// ---------- API ----------

const api = {
  "GET /api/employer": async () => {
    const employer = loadEmployers()[EMPLOYER_ID];
    return { id: EMPLOYER_ID, name: employer?.name, publicKey: employer?.publicKey, ...(await employerBalance()) };
  },

  "POST /api/payroll/preview": async (body) => {
    const error = validateRows(body.rows);
    if (error) return { status: 400, error };
    const { memos } = buildPaymentRequest(body.rows, EMPLOYER_ID, loadSigningKey(EMPLOYER_ID));
    const total = body.rows.reduce((s, r) => s + zecToZat(r.amount), 0n);
    return { memos, total: zatToZec(total) };
  },

  "POST /api/payroll/pay": async (body) => {
    const error = validateRows(body.rows);
    if (error) return { status: 400, error };
    const { uri } = buildPaymentRequest(body.rows, EMPLOYER_ID, loadSigningKey(EMPLOYER_ID));
    await runWithRetry(DEVTOOL, ["wallet", "-w", EMPLOYER_WALLET, "sync"]);
    const res = await runWithRetry(DEVTOOL, [
      "wallet", "-w", EMPLOYER_WALLET, "pay", "-i", EMPLOYER_IDENTITY, "--payment-uri", uri, "--disable-confirmation",
    ]);
    const txid = stripAnsi(res.out).trim().split(/\r?\n/).reverse().find((l) => /^[0-9a-f]{64}$/.test(l.trim()));
    if (res.code !== 0 || !txid) return { status: 502, error: friendlyError(res) };
    const fee = stripAnsi(res.out).match(/Fee:\s+([0-9.]+) TAZ/)?.[1];
    return { txid: txid.trim(), fee };
  },

  "GET /api/workers": async () => {
    const out = [];
    for (const w of DEMO_WORKERS) {
      if (!existsSync(`wallets/${w}`)) continue;
      const info = await walletInfo(`wallets/${w}`);
      out.push({ wallet: w, name: info.name, address: info.address, proof: `${info.birthday}:${info.uivk}` });
    }
    return { workers: out };
  },

  "POST /api/check": async (body) => {
    const [from, uivk] = String(body.proof ?? "").trim().split(":");
    if (!/^\d+$/.test(from ?? "") || !/^uivktest1[0-9a-z]+$/.test(uivk ?? "")) {
      return { status: 400, error: "That doesn't look like a salary proof code. It should look like 4524356:uivktest1…" };
    }
    const res = await runWithRetry(SCANNER, ["--uivk", uivk, "--from", from], { timeoutMs: 600000 });
    if (res.code !== 0) return { status: 502, error: friendlyError(res) };
    const payments = res.out.trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    const results = verifyPayments(payments, loadEmployers());
    const verified = results.filter((r) => r.status === "verified");
    const byPeriod = {};
    for (const r of verified) {
      const k = `${r.employerName} · ${r.payslip.period}`;
      byPeriod[k] = (byPeriod[k] ?? 0n) + BigInt(r.value_zat);
    }
    return {
      results: results.map((r) => ({ ...r, value: zatToZec(r.value_zat) })),
      summary: {
        verifiedCount: verified.length,
        verifiedTotal: zatToZec(verified.reduce((s, r) => s + BigInt(r.value_zat), 0n)),
        byPeriod: Object.fromEntries(Object.entries(byPeriod).map(([k, v]) => [k, zatToZec(v)])),
      },
    };
  },
};

// ---------- HTTP ----------

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const handler = api[`${req.method} ${url.pathname}`];
  if (handler) {
    try {
      let body = {};
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 200000) return send(res, 413, { error: "Request too large" });
        }
        body = JSON.parse(raw || "{}");
      }
      const result = await handler(body);
      const { status = 200, ...rest } = result;
      // Log the route only: never request bodies, which can contain viewing keys.
      console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} -> ${status}`);
      return send(res, status, rest);
    } catch (e) {
      console.error(`${req.method} ${url.pathname} failed: ${e.message}`);
      return send(res, 500, { error: e.message });
    }
  }

  // Static files
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = normalize(join(PUBLIC_DIR, path));
  if (!file.startsWith(normalize(PUBLIC_DIR)) || !existsSync(file)) return send(res, 404, "Not found", "text/plain");
  send(res, 200, readFileSync(file), MIME[extname(file)] ?? "application/octet-stream");
});

server.requestTimeout = 0; // payroll and scans can take a few minutes
server.listen(PORT, "127.0.0.1", () => console.log(`Payslip app running at http://localhost:${PORT}`));
