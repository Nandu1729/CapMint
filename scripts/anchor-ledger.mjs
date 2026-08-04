#!/usr/bin/env node
/**
 * anchor-ledger.mjs — External anchoring of the transparency ledger (RFC 3161).
 *
 * WHY THIS EXISTS
 *   The transparency ledger is a SHA-256 hash chain. On its own it proves only that
 *   nobody tampered with it *using the application role* — anyone with owner/DBA access
 *   could recompute the entire chain and rewrite history undetectably. Anchoring fixes
 *   that: we periodically send the current chain head to an independent RFC 3161
 *   Time-Stamping Authority, which returns a signed token proving "this exact hash
 *   existed at this exact time". A later rewrite produces a different head hash that
 *   cannot match the previously issued token, so silent tampering becomes provable.
 *
 * GUARANTEES / CONSTRAINTS
 *   - Runs as the database OWNER (ADMIN_DATABASE_URL). `log_entries` has SELECT and
 *     INSERT policies for `capmint_app` but deliberately no UPDATE policy, so the
 *     application role cannot write the anchor reference. That immutability is intended.
 *   - Never mutates ledger content. It only sets `published_anchor_reference` on the
 *     anchored head row.
 *   - Anchor tokens are written to `anchors/` as ordinary files so they can be committed
 *     and published (the pilot-scale public channel described in the PRD).
 *   - Dry run by default. `--confirm` is required to contact the TSA and write anything.
 *
 * USAGE
 *   ADMIN_DATABASE_URL='<owner URL>' node scripts/anchor-ledger.mjs            # plan only
 *   ADMIN_DATABASE_URL='<owner URL>' node scripts/anchor-ledger.mjs --confirm  # anchor
 *   ADMIN_DATABASE_URL='<owner URL>' node scripts/anchor-ledger.mjs --verify   # re-verify
 *
 * ENV
 *   ADMIN_DATABASE_URL   required. Owner connection (bypasses RLS).
 *   CAPMINT_TSA_URL      optional. Pin a single authority; otherwise a built-in list
 *                        (DigiCert, Sectigo, ai.moda) is tried in order.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANCHOR_DIR = path.join(REPO_ROOT, 'anchors');
// Public RFC 3161 authorities, tried in order. Transport is plain HTTP by design:
// the token is signed by the TSA, so its integrity does not depend on TLS, and only
// a SHA-256 digest ever leaves this machine.
const DEFAULT_TSA_URLS = [
  'http://timestamp.digicert.com',
  'http://timestamp.sectigo.com',
  'http://rfc3161.ai.moda'
];
const REFERENCE_PREFIX = 'rfc3161:';

/* ------------------------------------------------------------------ *
 * Minimal DER encoding (only what an RFC 3161 TimeStampReq needs)
 * ------------------------------------------------------------------ */

function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  const bytes = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

// OID 2.16.840.1.101.3.4.2.1 (sha256) and ASN.1 NULL parameters.
const OID_SHA256 = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
const ASN1_NULL = Buffer.from([0x05, 0x00]);
// OID 1.2.840.113549.1.9.16.1.4 (id-ct-TSTInfo)
const OID_TSTINFO = Buffer.from([0x06, 0x0b, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x04]);

/**
 * TimeStampReq ::= SEQUENCE { version, messageImprint, nonce, certReq }
 */
function buildTimeStampRequest(sha256Hex) {
  const digest = Buffer.from(sha256Hex, 'hex');
  if (digest.length !== 32) throw new Error(`expected a 32-byte SHA-256 digest, got ${digest.length}`);

  const algorithmIdentifier = der(0x30, Buffer.concat([OID_SHA256, ASN1_NULL]));
  const messageImprint = der(0x30, Buffer.concat([algorithmIdentifier, der(0x04, digest)]));
  const version = der(0x02, Buffer.from([0x01]));

  // Nonce must be a positive INTEGER; pad when the high bit is set.
  let nonceBytes = crypto.randomBytes(8);
  if (nonceBytes[0] & 0x80) nonceBytes = Buffer.concat([Buffer.from([0x00]), nonceBytes]);
  const nonce = der(0x02, nonceBytes);

  const certReq = der(0x01, Buffer.from([0xff])); // ask the TSA to include its certificate
  return der(0x30, Buffer.concat([version, messageImprint, nonce, certReq]));
}

/* ------------------------------------------------------------------ *
 * Minimal DER reading (enough to read the response and the TSTInfo)
 * ------------------------------------------------------------------ */

function readTlv(buffer, offset) {
  const tag = buffer[offset];
  let cursor = offset + 1;
  let length = buffer[cursor++];
  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < lengthBytes; i += 1) length = (length << 8) | buffer[cursor++];
  }
  return { tag, length, valueStart: cursor, end: cursor + length };
}

/**
 * TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken OPTIONAL }
 * PKIStatus 0 = granted, 1 = grantedWithMods; anything else is a rejection.
 */
function parseTimeStampResponse(response) {
  const outer = readTlv(response, 0);
  const statusInfo = readTlv(response, outer.valueStart);
  const statusInteger = readTlv(response, statusInfo.valueStart);
  const status = response[statusInteger.valueStart];
  const token = statusInfo.end < outer.end ? response.subarray(statusInfo.end, outer.end) : null;
  return { status, token };
}

/**
 * Pull the TSTInfo out of a TimeStampToken and read back what the TSA actually signed.
 */
function readTokenContents(token) {
  const oidIndex = token.indexOf(OID_TSTINFO);
  if (oidIndex < 0) throw new Error('token does not contain an id-ct-TSTInfo content type');

  const explicit = readTlv(token, oidIndex + OID_TSTINFO.length); // [0] EXPLICIT
  const octetString = readTlv(token, explicit.valueStart);
  const tstInfo = token.subarray(octetString.valueStart, octetString.end);

  const sequence = readTlv(tstInfo, 0);
  let cursor = sequence.valueStart;
  cursor = readTlv(tstInfo, cursor).end;                   // version
  cursor = readTlv(tstInfo, cursor).end;                   // policy
  const messageImprint = readTlv(tstInfo, cursor);
  cursor = messageImprint.end;
  const serialNumber = readTlv(tstInfo, cursor);
  const generalizedTime = readTlv(tstInfo, serialNumber.end);

  const algorithm = readTlv(tstInfo, messageImprint.valueStart);
  const digest = readTlv(tstInfo, algorithm.end);

  return {
    hashedMessage: tstInfo.subarray(digest.valueStart, digest.end).toString('hex'),
    genTime: tstInfo.subarray(generalizedTime.valueStart, generalizedTime.end).toString('ascii')
  };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function refuse(message) {
  process.stderr.write(`\nRefused: ${message}\n\n`);
  process.exit(1);
}

function parseArguments(argv) {
  const allowed = new Set(['--confirm', '--verify', '--help']);
  for (const argument of argv) {
    if (!allowed.has(argument)) refuse(`unknown argument "${argument}". Allowed: --confirm, --verify, --help.`);
  }
  return {
    confirm: argv.includes('--confirm'),
    verify: argv.includes('--verify'),
    help: argv.includes('--help')
  };
}

function requireAdminUrl() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) refuse('ADMIN_DATABASE_URL is required (the owner connection; the app role cannot write anchors).');
  if (!/^postgres(ql)?:\/\//.test(url)) refuse('ADMIN_DATABASE_URL must be a postgres:// connection string.');
  return url;
}

async function postToAuthority(tsaUrl, requestBody) {
  const response = await fetch(tsaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply' },
    body: requestBody,
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Try each configured authority in order so one unreachable TSA does not block anchoring.
 */
async function requestTimeStamp(tsaUrls, requestBody) {
  const failures = [];
  for (const tsaUrl of tsaUrls) {
    try {
      const response = await postToAuthority(tsaUrl, requestBody);
      const parsed = parseTimeStampResponse(response);
      if (parsed.status !== 0 && parsed.status !== 1) throw new Error(`PKIStatus ${parsed.status} (rejected)`);
      if (!parsed.token || parsed.token.length === 0) throw new Error('empty timestamp token');
      return { ...parsed, tsaUrl };
    } catch (error) {
      failures.push(`  ${tsaUrl} — ${error.message}`);
      process.stdout.write(`  ${tsaUrl} unavailable (${error.message}); trying next...\n`);
    }
  }
  refuse(`no timestamping authority could be reached.\n${failures.join('\n')}`);
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

async function readChainHead(client) {
  const result = await client.query(
    `SELECT id, current_hash, created_at, published_anchor_reference
       FROM log_entries
      ORDER BY created_at DESC, id DESC
      LIMIT 1`
  );
  return result.rows[0] || null;
}

async function anchor({ confirm }) {
  const adminUrl = requireAdminUrl();
  const tsaUrls = process.env.CAPMINT_TSA_URL ? [process.env.CAPMINT_TSA_URL] : DEFAULT_TSA_URLS;
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();

  try {
    const identity = await client.query('SELECT current_user AS role, current_database() AS database');
    const head = await readChainHead(client);
    if (!head) refuse('the ledger is empty — there is no chain head to anchor.');

    process.stdout.write('\nLedger anchoring plan\n');
    process.stdout.write(`  database        : ${identity.rows[0].database} (as ${identity.rows[0].role})\n`);
    process.stdout.write(`  chain head entry: ${head.id}\n`);
    process.stdout.write(`  head hash       : ${head.current_hash}\n`);
    process.stdout.write(`  head created    : ${head.created_at.toISOString()}\n`);
    process.stdout.write(`  timestamp source: ${tsaUrls.join(', ')}\n`);
    if (head.published_anchor_reference) {
      process.stdout.write(`  note            : head is already anchored (${head.published_anchor_reference})\n`);
    }

    if (!confirm) {
      process.stdout.write('\nDry run. No network request was made and nothing was written.\n');
      process.stdout.write('Re-run with --confirm to anchor this head.\n\n');
      return;
    }

    process.stdout.write('\nRequesting timestamp...\n');
    const request = buildTimeStampRequest(head.current_hash);
    const { token, tsaUrl } = await requestTimeStamp(tsaUrls, request);

    // Independently read back what the TSA signed rather than trusting our own request.
    const contents = readTokenContents(token);
    if (contents.hashedMessage.toLowerCase() !== head.current_hash.toLowerCase()) {
      refuse(`the token attests to a different digest (${contents.hashedMessage}) than the chain head.`);
    }

    fs.mkdirSync(ANCHOR_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tokenName = `${stamp}-${head.current_hash.slice(0, 12)}.tsr`;
    fs.writeFileSync(path.join(ANCHOR_DIR, tokenName), token);
    fs.writeFileSync(
      path.join(ANCHOR_DIR, `${tokenName}.json`),
      `${JSON.stringify(
        {
          anchoredHeadEntryId: head.id,
          anchoredHeadHash: head.current_hash,
          tsaUrl,
          tsaGenTime: contents.genTime,
          tokenFile: `anchors/${tokenName}`,
          tokenSha256: crypto.createHash('sha256').update(token).digest('hex')
        },
        null,
        2
      )}\n`
    );

    const reference = `${REFERENCE_PREFIX}anchors/${tokenName}`;
    if (reference.length > 255) refuse('the generated anchor reference exceeds the 255-character column limit.');
    await client.query('UPDATE log_entries SET published_anchor_reference = $2 WHERE id = $1', [head.id, reference]);

    process.stdout.write('\nAnchored.\n');
    process.stdout.write(`  TSA signing time: ${contents.genTime}\n`);
    process.stdout.write(`  token           : anchors/${tokenName} (${token.length} bytes)\n`);
    process.stdout.write(`  reference stored: ${reference}\n`);
    process.stdout.write('\nCommit the anchors/ directory to publish this proof.\n\n');
  } finally {
    await client.end();
  }
}

async function verify() {
  const adminUrl = requireAdminUrl();
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();

  try {
    const anchored = await client.query(
      `SELECT id, current_hash, created_at, published_anchor_reference
         FROM log_entries
        WHERE published_anchor_reference IS NOT NULL
        ORDER BY created_at ASC, id ASC`
    );

    if (anchored.rowCount === 0) {
      process.stdout.write('\nNo anchors recorded yet. Run with --confirm to create the first one.\n\n');
      return;
    }

    process.stdout.write(`\nVerifying ${anchored.rowCount} anchor(s)\n\n`);
    let failures = 0;

    for (const row of anchored.rows) {
      const reference = row.published_anchor_reference;
      const relativePath = reference.startsWith(REFERENCE_PREFIX)
        ? reference.slice(REFERENCE_PREFIX.length)
        : reference;
      const tokenPath = path.join(REPO_ROOT, relativePath);

      if (!fs.existsSync(tokenPath)) {
        failures += 1;
        process.stdout.write(`  FAIL  ${relativePath}\n        token file is missing\n`);
        continue;
      }

      try {
        const contents = readTokenContents(fs.readFileSync(tokenPath));
        if (contents.hashedMessage.toLowerCase() !== row.current_hash.toLowerCase()) {
          failures += 1;
          process.stdout.write(
            `  FAIL  ${relativePath}\n` +
              `        token attests ${contents.hashedMessage}\n` +
              `        ledger head is ${row.current_hash}\n`
          );
          continue;
        }
        process.stdout.write(`  OK    ${relativePath}\n        head ${row.current_hash.slice(0, 24)}… signed at ${contents.genTime}\n`);
      } catch (error) {
        failures += 1;
        process.stdout.write(`  FAIL  ${relativePath}\n        ${error.message}\n`);
      }
    }

    process.stdout.write(
      failures === 0
        ? '\nAll anchors match the ledger. History has not been rewritten since it was stamped.\n'
        : `\n${failures} anchor(s) FAILED. The ledger may have been altered after anchoring.\n`
    );
    process.stdout.write(
      '\nFor full cryptographic validation of a token against the TSA certificate chain:\n' +
        '  openssl ts -reply -in <token.tsr> -text\n\n'
    );
    if (failures > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

function showHelp() {
  process.stdout.write(
    '\nAnchor the transparency ledger head to an RFC 3161 timestamping authority.\n\n' +
      'Usage:\n' +
      "  ADMIN_DATABASE_URL='<owner URL>' node scripts/anchor-ledger.mjs             plan only (default)\n" +
      "  ADMIN_DATABASE_URL='<owner URL>' node scripts/anchor-ledger.mjs --confirm   request and store an anchor\n" +
      "  ADMIN_DATABASE_URL='<owner URL>' node scripts/anchor-ledger.mjs --verify    re-check stored anchors\n\n" +
      `Environment: CAPMINT_TSA_URL pins one authority. Default order:\n` +
      DEFAULT_TSA_URLS.map(url => `  ${url}\n`).join('') +
      '\n'
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return showHelp();
  if (options.verify) return verify();
  return anchor(options);
}

main().catch(error => {
  process.stderr.write(`\nFailed: ${error.message}\n\n`);
  process.exit(1);
});
