'use strict';

// Regression tests for symlinked upload paths escaping the scanned directory.
// Only the network upload is stubbed; ZIP contents are built with the real
// @actions/artifact implementation so the packaged bytes are asserted.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const zlib = require('zlib');

const { uploadArtifact } = require('../index.js');
const { getUploadZipSpecification } = require('@actions/artifact/lib/internal/upload/upload-zip-specification');
const { createZipUploadStream } = require('@actions/artifact/lib/internal/upload/zip');

const FAKE_PAT = `ghp_${'P'.repeat(36)}`;
// base64("x-access-token:ghs_") prefix the action looks for, plus filler.
const FAKE_GIT_CONFIG = '[http]\n\textraheader = AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2hzX0ZBS0U=\n';

function makeWorkspace(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'usa-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.GITHUB_WORKSPACE;
  process.env.GITHUB_WORKSPACE = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.GITHUB_WORKSPACE;
    else process.env.GITHUB_WORKSPACE = previous;
  });
  return dir;
}

function recordingClient() {
  const calls = [];
  return {
    calls,
    async uploadArtifact(name, files, root, options) {
      calls.push({ name, files, root, options });
      return { id: 1, size: 0 };
    },
  };
}

// Builds the real artifact ZIP and returns { entryName: Buffer }.
async function zipEntries(files, root) {
  const spec = getUploadZipSpecification(files, root);
  const stream = await createZipUploadStream(spec, 0);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return parseZip(Buffer.concat(chunks));
}

function parseZip(buf) {
  const entries = {};
  // Walk the central directory (end record is at the tail).
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    if (!name.endsWith('/')) {
      entries[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function setupOutsideSecrets(ws) {
  fs.mkdirSync(path.join(ws, '.git'));
  fs.writeFileSync(path.join(ws, '.git', 'config'), FAKE_GIT_CONFIG);
  fs.mkdirSync(path.join(ws, 'runner-secrets'));
  fs.writeFileSync(path.join(ws, 'runner-secrets', 'token.txt'), FAKE_PAT);
  fs.mkdirSync(path.join(ws, 'output'));
  fs.writeFileSync(path.join(ws, 'output', 'report.txt'), 'hello\n');
}

test('rejects file symlink pointing outside the scanned path', async (t) => {
  const ws = makeWorkspace(t);
  setupOutsideSecrets(ws);
  fs.symlinkSync('../runner-secrets/token.txt', path.join(ws, 'output', 'token.txt'));

  const client = recordingClient();
  await assert.rejects(
    uploadArtifact(client, 'a', path.join(ws, 'output')),
    /Refusing to upload symbolic link .*token\.txt.*outside the scanned artifact path/,
  );
  assert.strictEqual(client.calls.length, 0);
});

test('rejects benignly named symlink to .git/config outside the scanned path', async (t) => {
  const ws = makeWorkspace(t);
  setupOutsideSecrets(ws);
  fs.symlinkSync('../.git/config', path.join(ws, 'output', 'config.json'));

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', path.join(ws, 'output')), /outside the scanned artifact path/);
  assert.strictEqual(client.calls.length, 0);
});

test('rejects directory symlink pointing outside the scanned path', async (t) => {
  const ws = makeWorkspace(t);
  setupOutsideSecrets(ws);
  fs.symlinkSync('../runner-secrets', path.join(ws, 'output', 'linked-dir'));

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', path.join(ws, 'output')), /linked-dir.*outside the scanned artifact path/);
  assert.strictEqual(client.calls.length, 0);
});

test('rejects symlink to /proc/self/environ', { skip: !fs.existsSync('/proc/self/environ') }, async (t) => {
  const ws = makeWorkspace(t);
  fs.mkdirSync(path.join(ws, 'output'));
  fs.symlinkSync('/proc/self/environ', path.join(ws, 'output', 'diagnostics.txt'));

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', path.join(ws, 'output')), /diagnostics\.txt.*outside the scanned artifact path/);
  assert.strictEqual(client.calls.length, 0);
});

test('rejects a top-level path that resolves into /proc', { skip: !fs.existsSync('/proc/self/environ') }, async (t) => {
  const ws = makeWorkspace(t);
  fs.symlinkSync('/proc/self/environ', path.join(ws, 'output'));

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', path.join(ws, 'output')), /under \/proc/);
  assert.strictEqual(client.calls.length, 0);
});

test('rejects Git-tracked symlink preserved by clean clone and cp -a', async (t) => {
  const ws = makeWorkspace(t);
  const src = path.join(ws, 'contrib');
  fs.mkdirSync(path.join(src, 'source-assets'), { recursive: true });
  fs.writeFileSync(path.join(src, 'source-assets', 'index.html'), '<p>hi</p>\n');
  fs.symlinkSync('../.git/config', path.join(src, 'source-assets', 'config.json'));
  const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git(['init', '-q'], src);
  git(['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '.'], src);
  git(['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'x'], src);

  const checkout = path.join(ws, 'checkout');
  git(['clone', '-q', src, checkout], ws);
  fs.appendFileSync(path.join(checkout, '.git', 'config'), FAKE_GIT_CONFIG);
  assert.match(git(['ls-files', '--stage', 'source-assets/config.json'], checkout).toString(), /^120000 /);
  execFileSync('cp', ['-a', path.join(checkout, 'source-assets'), path.join(checkout, 'output')]);

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', path.join(checkout, 'output')), /outside the scanned artifact path/);
  assert.strictEqual(client.calls.length, 0);
});

test('rejects direct .git/config file input containing the runner token', async (t) => {
  const ws = makeWorkspace(t);
  setupOutsideSecrets(ws);

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', path.join(ws, '.git', 'config')), /Found GITHUB_TOKEN/);
  assert.strictEqual(client.calls.length, 0);
});

test('still rejects a directory containing .git with the runner token', async (t) => {
  const ws = makeWorkspace(t);
  setupOutsideSecrets(ws);

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', ws, undefined, undefined, 'warn', 'true'), /Found GITHUB_TOKEN/);
  assert.strictEqual(client.calls.length, 0);
});

test('allows symlinks that stay inside the scanned path and zips only in-root bytes', async (t) => {
  const ws = makeWorkspace(t);
  setupOutsideSecrets(ws);
  const out = path.join(ws, 'output');
  fs.mkdirSync(path.join(out, 'lib'));
  fs.writeFileSync(path.join(out, 'lib', 'libfoo.so.1'), 'ELF-ish\n');
  fs.symlinkSync('libfoo.so.1', path.join(out, 'lib', 'libfoo.so'));
  fs.symlinkSync('..', path.join(out, 'lib', 'loop')); // cycle must terminate

  const client = recordingClient();
  await uploadArtifact(client, 'a', out);
  assert.strictEqual(client.calls.length, 1);
  const rel = client.calls[0].files.map((f) => path.relative(ws, f)).sort();
  assert.deepStrictEqual(rel, ['output/lib/libfoo.so', 'output/lib/libfoo.so.1', 'output/report.txt']);

  const entries = await zipEntries(client.calls[0].files, ws);
  assert.deepStrictEqual(Object.keys(entries).sort(), rel);
  assert.strictEqual(entries['output/lib/libfoo.so'].toString(), 'ELF-ish\n');
  for (const data of Object.values(entries)) {
    assert.ok(!data.includes(FAKE_PAT));
    assert.ok(!data.includes('eC1hY2Nlc3MtdG9rZW46Z2hz'));
  }
});

test('ordinary directory upload is unchanged and excludes hidden files by default', async (t) => {
  const ws = makeWorkspace(t);
  const out = path.join(ws, 'output');
  fs.mkdirSync(path.join(out, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(out, 'a.txt'), 'a');
  fs.writeFileSync(path.join(out, '.hidden'), 'h');
  fs.writeFileSync(path.join(out, 'sub', 'b.txt'), 'b');

  const client = recordingClient();
  await uploadArtifact(client, 'a', out);
  const rel = client.calls[0].files.map((f) => path.relative(ws, f)).sort();
  assert.deepStrictEqual(rel, ['output/a.txt', 'output/sub/b.txt']);
});
