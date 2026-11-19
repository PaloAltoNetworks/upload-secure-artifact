'use strict';

// Regression tests for findings.md: hidden-directory filtering, hidden
// top-level targets, .git as the upload root, submodule configs and non-ghs
// tokens in persisted git credentials.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { uploadArtifact } = require('../index.js');

const b64 = (s) => Buffer.from(s).toString('base64');
const gitConfigWith = (token) => `[http]\n\textraheader = AUTHORIZATION: basic ${b64(`x-access-token:${token}`)}\n`;
const GHS_CONFIG = gitConfigWith(`ghs_${'A'.repeat(36)}`);

function makeWorkspace(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'usa-hidden-')));
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
    async uploadArtifact(name, files) {
      calls.push(files);
      return { id: 1, size: 0 };
    },
  };
}

function write(file, content = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const rel = (ws, client) => (client.calls[0] || []).map((f) => path.relative(ws, f)).sort();

test('Finding 1: contents of hidden directories are excluded by default', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, 'out', 'a.txt'));
  write(path.join(ws, 'out', '.aws', 'credentials'));
  write(path.join(ws, 'out', '.ssh', 'config'));
  write(path.join(ws, 'out', 'sub', '.docker', 'config.json'));
  write(path.join(ws, 'out', '.git', 'config'), '[core]\n');

  const client = recordingClient();
  await uploadArtifact(client, 'a', path.join(ws, 'out'));
  assert.deepStrictEqual(rel(ws, client), ['out/a.txt']);
});

test('Finding 1: hidden directories are included when include-hidden-files is true', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, 'out', 'a.txt'));
  write(path.join(ws, 'out', '.aws', 'credentials'));

  const client = recordingClient();
  await uploadArtifact(client, 'a', path.join(ws, 'out'), undefined, undefined, 'warn', 'true');
  assert.deepStrictEqual(rel(ws, client), ['out/.aws/credentials', 'out/a.txt']);
});

test('Finding 1: a non-hidden symlink into a hidden directory is excluded by default', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, 'out', 'a.txt'));
  write(path.join(ws, 'out', '.aws', 'credentials'));
  fs.symlinkSync('.aws', path.join(ws, 'out', 'aws'));
  fs.symlinkSync('.aws/credentials', path.join(ws, 'out', 'creds.txt'));

  const client = recordingClient();
  await uploadArtifact(client, 'a', path.join(ws, 'out'));
  assert.deepStrictEqual(rel(ws, client), ['out/a.txt']);
});

test('Finding 3: a hidden top-level file target is skipped by default', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, '.env'), 'SECRET=1');
  write(path.join(ws, '.aws', 'credentials'));

  const client = recordingClient();
  await uploadArtifact(client, 'a', `${path.join(ws, '.env')}\n${path.join(ws, '.aws', 'credentials')}`);
  assert.strictEqual(client.calls.length, 0);

  const client2 = recordingClient();
  await uploadArtifact(client2, 'a', path.join(ws, '.env'), undefined, undefined, 'warn', 'true');
  assert.deepStrictEqual(rel(ws, client2), ['.env']);
});

test('Finding 2: uploading the .git directory itself is rejected when it holds a token', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, '.git', 'config'), GHS_CONFIG);

  for (const includeHidden of ['false', 'true']) {
    const client = recordingClient();
    await assert.rejects(
      uploadArtifact(client, 'a', path.join(ws, '.git'), undefined, undefined, 'warn', includeHidden),
      /Found GITHUB_TOKEN/,
    );
    assert.strictEqual(client.calls.length, 0);
  }
});

test('token in a later .git directory is found, not only the first', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, 'out', 'a', '.git', 'config'), '[core]\n');
  write(path.join(ws, 'out', 'b', '.git', 'config'), GHS_CONFIG);

  const client = recordingClient();
  await assert.rejects(uploadArtifact(client, 'a', path.join(ws, 'out')), /Found GITHUB_TOKEN.*b.\.git.config/);
  assert.strictEqual(client.calls.length, 0);
});

test('token in a submodule config under .git/modules is rejected', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, 'out', '.git', 'config'), '[core]\n');
  write(path.join(ws, 'out', '.git', 'modules', 'sub', 'config'), GHS_CONFIG);

  const client = recordingClient();
  await assert.rejects(
    uploadArtifact(client, 'a', path.join(ws, 'out'), undefined, undefined, 'warn', 'true'),
    /Found GITHUB_TOKEN.*modules.sub.config/,
  );
  assert.strictEqual(client.calls.length, 0);
});

for (const [label, config] of [
  ['classic PAT (ghp_)', gitConfigWith(`ghp_${'B'.repeat(36)}`)],
  ['fine-grained PAT (github_pat_)', gitConfigWith(`github_pat_${'C'.repeat(60)}`)],
  ['plaintext remote URL', `[remote "origin"]\n\turl = https://x-access-token:ghp_${'D'.repeat(36)}@github.com/o/r\n`],
]) {
  test(`persisted ${label} in .git/config is rejected`, async (t) => {
    const ws = makeWorkspace(t);
    write(path.join(ws, 'out', 'a.txt'));
    write(path.join(ws, 'out', '.git', 'config'), config);

    const client = recordingClient();
    await assert.rejects(uploadArtifact(client, 'a', path.join(ws, 'out')), /Found GITHUB_TOKEN/);
    assert.strictEqual(client.calls.length, 0);
  });
}

test('git config without credentials does not block the upload', async (t) => {
  const ws = makeWorkspace(t);
  write(path.join(ws, 'out', 'a.txt'));
  write(path.join(ws, 'out', '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/o/r\n');

  const client = recordingClient();
  await uploadArtifact(client, 'a', path.join(ws, 'out'), undefined, undefined, 'warn', 'true');
  assert.deepStrictEqual(rel(ws, client), ['out/.git/config', 'out/a.txt']);
});
