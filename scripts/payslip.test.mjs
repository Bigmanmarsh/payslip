// Run: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { signPayslip, verifyPayments, zecToZat, zatToZec } from "./payslip.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const employers = { acme: { id: "acme", name: "Acme", publicKey: publicKey.export({ format: "jwk" }).x } };
const slip = (over = {}) => ({ employer: "acme", id: "001", worker: "Ada", period: "2026-10", zat: 5000000n, ...over });
const pay = (memo, value_zat = 5000000, txid = "aa") => ({ txid, height: 1, value_zat, memo });

test("amount conversion", () => {
  assert.equal(zecToZat("0.05"), 5000000n);
  assert.equal(zecToZat("1"), 100000000n);
  assert.equal(zatToZec(5000000), "0.05000000");
  assert.throws(() => zecToZat("0.123456789"));
});

test("a correctly signed payslip verifies", () => {
  const [r] = verifyPayments([pay(signPayslip(slip(), privateKey))], employers);
  assert.equal(r.status, "verified");
});

test("a tampered payslip is rejected", () => {
  const memo = signPayslip(slip(), privateKey).replace("|Ada|", "|Eve|");
  assert.equal(verifyPayments([pay(memo)], employers)[0].status, "invalid");
});

test("a payslip signed by someone else is rejected", () => {
  const other = generateKeyPairSync("ed25519").privateKey;
  assert.equal(verifyPayments([pay(signPayslip(slip(), other))], employers)[0].status, "invalid");
});

test("paid amount must match the payslip", () => {
  const [r] = verifyPayments([pay(signPayslip(slip(), privateKey), 9000000)], employers);
  assert.equal(r.status, "invalid");
  assert.match(r.reason, /was paid/);
});

test("a copied payslip is only counted once", () => {
  const memo = signPayslip(slip(), privateKey);
  const rs = verifyPayments([pay(memo, 5000000, "aa"), pay(memo, 5000000, "bb")], employers);
  assert.deepEqual(rs.map((r) => r.status), ["verified", "invalid"]);
});

test("unknown employers and plain memos are not counted", () => {
  const rs = verifyPayments([pay(signPayslip(slip({ employer: "ghost" }), privateKey)), pay("hello")], employers);
  assert.deepEqual(rs.map((r) => r.status), ["invalid", "not-a-payslip"]);
});

test("fields cannot contain the separator", () => {
  assert.throws(() => signPayslip(slip({ worker: "A|B" }), privateKey));
});
