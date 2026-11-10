import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  isAdminSessionValid,
  readCookie,
  safeTextEqual,
  verifyAdminSession,
} from '../src/security/AdminAuth';

const secret = 'test-session-secret-that-is-at-least-32-characters-long';
const now = 1_800_000_000_000;

test('admin session is signed, expires after eight hours and rejects tampering', () => {
  const token = createAdminSession(secret, now);
  assert.equal(verifyAdminSession(token, secret, now), true);
  assert.equal(verifyAdminSession(token, secret, now + ADMIN_SESSION_TTL_SECONDS * 1000), false);
  assert.equal(verifyAdminSession(token + 'x', secret, now), false);
  assert.equal(verifyAdminSession(token, 'a-different-session-secret-that-is-long-enough', now), false);
});

test('cookie parsing handles multiple cookies and malformed values', () => {
  const token = createAdminSession(secret, now);
  const header = 'theme=dark; nexus_admin_session=' + encodeURIComponent(token) + '; other=value';
  assert.equal(readCookie(header, 'nexus_admin_session'), token);
  assert.equal(isAdminSessionValid(header, secret), true);
  assert.equal(readCookie('nexus_admin_session=%E0%A4%A', 'nexus_admin_session'), undefined);
});

test('constant-time text comparison handles equal and unequal values', () => {
  assert.equal(safeTextEqual('secret', 'secret'), true);
  assert.equal(safeTextEqual('secret', 'secreT'), false);
  assert.equal(safeTextEqual('secret', 'short'), false);
});
