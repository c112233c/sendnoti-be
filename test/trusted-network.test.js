import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedAddress } from "../src/trusted-network.js";

test("allows IPv4 addresses inside a trusted CIDR", () => {
  assert.equal(isTrustedAddress("10.20.30.42", ["10.20.30.0/24"]), true);
  assert.equal(isTrustedAddress("10.20.31.42", ["10.20.30.0/24"]), false);
});

test("supports loopback and IPv4-mapped IPv6 addresses", () => {
  assert.equal(isTrustedAddress("127.0.0.1", ["127.0.0.1/32"]), true);
  assert.equal(isTrustedAddress("::1", ["::1/128"]), true);
  assert.equal(isTrustedAddress("::ffff:10.20.30.42", ["10.20.30.0/24"]), true);
});

test("rejects malformed and unlisted addresses", () => {
  assert.equal(isTrustedAddress("not-an-ip", ["10.0.0.0/8"]), false);
  assert.equal(isTrustedAddress("192.168.1.4", ["10.0.0.0/8"]), false);
});
