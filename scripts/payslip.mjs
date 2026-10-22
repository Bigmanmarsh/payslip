// Employer-signed payslips for private Zcash payroll.
//
// A payslip is a memo of the form:
//   ZPAY1|<employer-id>|<payslip-id>|<worker>|<period>|<amount-zat>|<signature>
// The signature is Ed25519 over everything before the last "|".
//
// Commands:
//   node scripts/payslip.mjs keygen <employer-id> "<Employer Name>"
//       Creates wallets/<employer-id>.signing.json (SECRET, never share or commit)
//       and employers/<employer-id>.json (public key, safe to publish).
//   node scripts/payslip.mjs pay-request <employer-id> <payroll.csv>
//       Reads name,address,amount,period rows and prints one ZIP 321 payment
//       request URI whose memos are signed payslips.
//   node scripts/payslip.mjs verify <scan.jsonl>
//       Reads payslip-scan output and checks every payslip against employers/.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERSION = "ZPAY1";
const FIELD_RE = /^[^|\r\n]+$/;

export function zecToZat(amount) {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(String(amount).trim());
  if (!m) throw new Error(`Bad amount: ${amount}`);
  return BigInt(m[1]) * 100000000n + BigInt((m[2] ?? "").padEnd(8, "0"));
}

export function zatToZec(zat) {
  const z = BigInt(zat);
  return `${z / 100000000n}.${(z % 100000000n).toString().padStart(8, "0")}`;
}

export function payslipPayload({ employer, id, worker, period, zat }) {
  for (const [k, v] of Object.entries({ employer, id, worker, period })) {
    if (!FIELD_RE.test(v)) throw new Error(`Field ${k} must be non-empty and must not contain "|"`);
  }
  return [VERSION, employer, id, worker, period, String(zat)].join("|");
}

export function signPayslip(fields, privateKey) {
  const payload = payslipPayload(fields);
  const sig = sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64url");
  const memo = `${payload}|${sig}`;
  if (Buffer.byteLength(memo, "utf8") > 512) throw new Error(`Payslip ${fields.id} is longer than 512 bytes`);
  return memo;
}

export function parsePayslip(memo) {
  if (typeof memo !== "string" || !memo.startsWith(`${VERSION}|`)) return null;
  const parts = memo.split("|");
  if (parts.length !== 7) return null;
  const [, employer, id, worker, period, zat, sig] = parts;
  if (!/^\d+$/.test(zat)) return null;
  return { employer, id, worker, period, zat: BigInt(zat), sig, payload: parts.slice(0, 6).join("|") };
}

export function publicKeyFromRaw(x) {
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" });
}

// Checks scanned payments. Each payment: { txid, height, value_zat, memo }.
// employers: { [id]: { name, publicKey } }.
export function verifyPayments(payments, employers) {
  const seen = new Map();
  return payments.map((p) => {
    const slip = parsePayslip(p.memo);
    if (!slip) return { ...p, status: "not-a-payslip", reason: "Memo is not a signed payslip" };

    const employer = employers[slip.employer];
    const base = { ...p, payslip: { ...slip, zat: slip.zat.toString() }, employerName: employer?.name };
    if (!employer) return { ...base, status: "invalid", reason: `Unknown employer "${slip.employer}"` };

    const ok = verify(null, Buffer.from(slip.payload, "utf8"), publicKeyFromRaw(employer.publicKey),
      Buffer.from(slip.sig, "base64url"));
    if (!ok) return { ...base, status: "invalid", reason: "Signature does not match the employer's public key" };

    if (BigInt(p.value_zat) !== slip.zat) {
      return { ...base, status: "invalid", reason: `Payslip says ${zatToZec(slip.zat)} but ${zatToZec(p.value_zat)} was paid` };
    }

    const key = `${slip.employer}|${slip.id}`;
    if (seen.has(key)) {
      return { ...base, status: "invalid", reason: `Duplicate of payslip ${slip.id} already counted in ${seen.get(key)}` };
    }
    seen.set(key, p.txid);
    return { ...base, status: "verified" };
  });
}

export function loadEmployers(dir = "employers") {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const e = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    out[e.id] = e;
  }
  return out;
}

export function loadSigningKey(employerId) {
  const jwk = JSON.parse(readFileSync(`wallets/${employerId}.signing.json`, "utf8"));
  return createPrivateKey({ key: jwk, format: "jwk" });
}

// rows: [{ id, name, address, amount, period }] -> { uri, memos }
export function buildPaymentRequest(rows, employerId, privateKey) {
  const memos = [];
  const params = rows.map((row, i) => {
    const zat = zecToZat(row.amount);
    const memo = signPayslip({ employer: employerId, id: row.id, worker: row.name, period: row.period, zat }, privateKey);
    memos.push(memo);
    const s = i === 0 ? "" : `.${i}`;
    return `address${s}=${row.address}&amount${s}=${row.amount}&memo${s}=${Buffer.from(memo, "utf8").toString("base64url")}`;
  });
  return { uri: `zcash:?${params.join("&")}`, memos };
}

function readCsv(path) {
  const [header, ...rows] = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const cols = header.split(",").map((c) => c.trim());
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v.trim()])));
}

function main([cmd, ...args]) {
  if (cmd === "keygen") {
    const [id, name] = args;
    if (!id || !name) throw new Error('Usage: keygen <employer-id> "<Employer Name>"');
    const secretPath = `wallets/${id}.signing.json`;
    if (existsSync(secretPath)) throw new Error(`${secretPath} already exists; refusing to overwrite`);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    mkdirSync("wallets", { recursive: true });
    mkdirSync("employers", { recursive: true });
    writeFileSync(secretPath, JSON.stringify(privateKey.export({ format: "jwk" })));
    const pub = { id, name, publicKey: publicKey.export({ format: "jwk" }).x };
    writeFileSync(`employers/${id}.json`, JSON.stringify(pub, null, 2) + "\n");
    console.log(`Secret signing key: ${secretPath} (never share or commit)`);
    console.log(`Public key:         employers/${id}.json`);
  } else if (cmd === "pay-request") {
    const [id, csv] = args;
    console.log(buildPaymentRequest(readCsv(csv), id, loadSigningKey(id)).uri);
  } else if (cmd === "verify") {
    const payments = readFileSync(args[0], "utf8").trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    for (const r of verifyPayments(payments, loadEmployers())) {
      const mark = r.status === "verified" ? "VERIFIED" : r.status === "invalid" ? "INVALID " : "skipped ";
      const who = r.payslip ? `${r.employerName ?? r.payslip.employer} -> ${r.payslip.worker}, ${r.payslip.period}, #${r.payslip.id}` : "";
      console.log(`${mark} ${zatToZec(r.value_zat)} TAZ  ${who}  ${r.reason ?? ""}`.trimEnd());
    }
  } else {
    console.log("Commands: keygen, pay-request, verify (see top of file)");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
