const { DefaultArtifactClient } = require("@actions/artifact");
const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const DEFAULT_IF_NO_FILES_FOUND = 'warn';

async function main(github, context, artifactName, artifactPath, retentionDays, compressionLevel, ifNoFilesFound, includeHiddenFiles) {
  const artifactClient = new DefaultArtifactClient();

  try {
    await uploadArtifact(
      artifactClient,
      artifactName,
      artifactPath,
      retentionDays,
      compressionLevel,
      ifNoFilesFound,
      includeHiddenFiles,
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

function parseArtifactPaths(artifactPath) {
  if (!artifactPath) {
    return [];
  }

  return artifactPath
    .split(/[\r\n|]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

const PSEUDO_FILESYSTEM_ROOTS = ['/proc', '/sys', '/dev'];
// actions/checkout persists credentials as
//   extraheader = AUTHORIZATION: basic base64("x-access-token:<token>")
// base64("x-access-token:") is exactly 20 characters, so the encoded prefix is
// stable regardless of the token type (ghs_ GITHUB_TOKEN, ghp_/github_pat_ PAT,
// etc.). Also match the plaintext form used in remote URLs
// (https://x-access-token:<token>@github.com/...).
const GITHUB_RUNNER_TOKEN_REGEX = /eC1hY2Nlc3MtdG9rZW46[A-Za-z0-9+/]{4,}|x-access-token:[A-Za-z0-9_]{4,}/;

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function assertNotPseudoFilesystem(displayPath, resolvedPath) {
  if (process.platform === 'win32') {
    return;
  }
  for (const root of PSEUDO_FILESYSTEM_ROOTS) {
    if (isWithin(root, resolvedPath)) {
      throw new Error(`Refusing to upload ${displayPath}: it resolves to ${resolvedPath}, which is under ${root}.`);
    }
  }
}

function isHiddenName(name) {
  return name.startsWith('.') && name !== '.' && name !== '..';
}

function hasHiddenSegment(relativePath) {
  return relativePath.split(/[\\/]+/).some(isHiddenName);
}

// Returns true when a configured (top-level) artifact path is hidden. Inside
// the workspace every segment relative to the workspace is considered (so
// ".git/config" or ".aws/credentials" count as hidden); outside it only the
// basename is, so absolute paths under e.g. ~/.cache are not rejected.
function isHiddenTopLevelPath(configuredPath, resolvedPath) {
  const workspace = process.env.GITHUB_WORKSPACE;
  let workspaceReal = null;
  if (workspace) {
    try {
      workspaceReal = fs.realpathSync(workspace);
    } catch (error) {
      workspaceReal = path.resolve(workspace);
    }
  }

  for (const candidate of [path.resolve(configuredPath), resolvedPath]) {
    if (workspaceReal && isWithin(workspaceReal, candidate)) {
      if (hasHiddenSegment(path.relative(workspaceReal, candidate))) {
        return true;
      }
    } else if (isHiddenName(path.basename(candidate))) {
      return true;
    }
  }
  return false;
}

// Checks a file selected for upload that is (or resolves to) a git config
// file: .git/config, but also submodule configs under .git/modules/**/config,
// where actions/checkout also persists credentials. This covers direct file
// inputs and anything findGitFolders misses.
function gitConfigFileWithGitHubRunnerToken(filePath) {
  let resolved;
  try {
    resolved = fs.realpathSync(filePath);
  } catch (error) {
    throw new Error(`Unable to resolve artifact file: ${filePath}. ${error.message}`);
  }

  const segments = path.dirname(resolved).split(path.sep);
  if (path.basename(resolved) !== 'config' || !segments.includes('.git')) {
    return null;
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  return GITHUB_RUNNER_TOKEN_REGEX.test(content) ? filePath : null;
}

async function uploadArtifact(artifactClient, artifactName, artifactPath, retentionDays, compressionLevel, ifNoFilesFound = DEFAULT_IF_NO_FILES_FOUND, includeHiddenFiles) {
  const paths = parseArtifactPaths(artifactPath);
  const filesToUpload = [];
  const includeHidden = String(includeHiddenFiles).toLowerCase() === 'true';

  for (const singlePath of paths) {
    if (!fs.existsSync(singlePath)) {
      core.info(`Skipping missing artifact path: ${singlePath}`);
      continue;
    }

    // The secrets scan runs against the canonical (fully resolved) form of
    // each configured path. Every file that is uploaded must resolve inside
    // that same canonical root, otherwise the uploader could package bytes
    // the scanner never saw (e.g. via a symlink to ../.git/config or
    // /proc/self/environ).
    const scanRoot = await fs.promises.realpath(singlePath);
    assertNotPseudoFilesystem(singlePath, scanRoot);

    const foundPath = hasGitFolderWithGitHubRunnerToken(scanRoot);
    if (foundPath) {
      throw new Error(`Found GITHUB_TOKEN in artifact, under path ${foundPath}`);
    }

    const rootStats = await fs.promises.stat(scanRoot);
    if (!rootStats.isFile() && !rootStats.isDirectory()) {
      throw new Error(`Artifact path is not a regular file or directory: ${singlePath}`);
    }

    // Token checks above run before the hidden filter on purpose: an explicit
    // attempt to upload credentials should fail loudly, not be skipped.
    if (rootStats.isFile()) {
      const tokenPath = gitConfigFileWithGitHubRunnerToken(singlePath);
      if (tokenPath) {
        throw new Error(`Found GITHUB_TOKEN in artifact, under path ${tokenPath}`);
      }
    }

    if (!includeHidden && isHiddenTopLevelPath(singlePath, scanRoot)) {
      core.info(`Skipping hidden artifact path (set include-hidden-files: true to upload it): ${singlePath}`);
      continue;
    }

    if (rootStats.isFile()) {
      filesToUpload.push(singlePath);
      continue;
    }

    filesToUpload.push(...(await collectFiles(singlePath, scanRoot, includeHidden)));
  }

  for (const file of filesToUpload) {
    const tokenPath = gitConfigFileWithGitHubRunnerToken(file);
    if (tokenPath) {
      throw new Error(`Found GITHUB_TOKEN in artifact, under path ${tokenPath}`);
    }
  }

  if (filesToUpload.length === 0) {
    const message = `No files were found with the provided path: ${artifactPath}. No artifacts will be uploaded.`;

    switch (String(ifNoFilesFound).toLowerCase()) {
      case 'error':
        throw new Error(message);
      case 'ignore':
        core.info(message);
        return;
      case 'warn':
      default:
        core.warning(message);
        return;
    }
  }

  const uploadOptions = {};
  const parsedRetentionDays = Number.parseInt(retentionDays, 10);
  if (Number.isNaN(parsedRetentionDays)) {
    if (retentionDays) {
      core.warning(`Ignoring invalid retention-days value: ${retentionDays}`);
    }
  } else if (parsedRetentionDays <= 0) {
    if (retentionDays) {
      core.warning(`Ignoring non-positive retention-days value: ${retentionDays}`);
    }
  } else if (parsedRetentionDays > 0) {
    uploadOptions.retentionDays = parsedRetentionDays;
  }

  await artifactClient.uploadArtifact(
    artifactName,
    filesToUpload,
    process.env.GITHUB_WORKSPACE,
    uploadOptions,
  );
}

// Returns every .git directory at or below startPath, including startPath
// itself when the configured artifact path *is* a .git directory.
function findGitFolders(startPath, found = []) {
  try {
    if (!fs.existsSync(startPath) || !fs.statSync(startPath).isDirectory()) {
      return found;
    }

    if (found.length === 0 && path.basename(startPath) === '.git') {
      found.push(startPath);
      return found;
    }

    // Use lstat semantics (Dirent) and do not descend into symlinked
    // directories: links that escape the root are rejected later, and links
    // inside the root point at directories this walk already visits. This
    // also prevents symlink loops from aborting the search early.
    const entries = fs.readdirSync(startPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const filePath = path.join(startPath, entry.name);
      if (entry.name === '.git') {
        found.push(filePath);
      } else {
        findGitFolders(filePath, found);
      }
    }
  } catch (error) {
    console.log(error);
  }

  return found;
}

function hasGitFolderWithGitHubRunnerToken(pathToCheck) {
  for (const gitDir of findGitFolders(pathToCheck)) {
    const configFile = path.join(gitDir, 'config');
    try {
      if (fs.existsSync(configFile)) {
        const configContent = fs.readFileSync(configFile, 'utf-8');
        if (GITHUB_RUNNER_TOKEN_REGEX.test(configContent)) {
          return configFile;
        }
      }
    } catch (error) {
      console.error('Error checking Git config:', error);
    }
  }

  return null;
}

// Recursively collects regular files under targetPath. Entries are inspected
// with lstat so symbolic links are never followed blindly: a link is only
// accepted when its fully resolved target stays inside scanRoot (the
// canonical path the secrets scanner inspected). Links that escape it are
// rejected so the uploaded bytes always match the scanned bytes.
//
// When includeHiddenFiles is false, hidden entries are skipped whether they
// are files or directories, so nothing beneath e.g. .git/, .aws/ or .ssh/ is
// uploaded. A non-hidden symlink whose target lies under a hidden path inside
// scanRoot is skipped as well, so the filter cannot be sidestepped by aliasing.
async function collectFiles(targetPath, scanRoot, includeHiddenFiles, visitedDirs = new Set()) {
  const fsp = fs.promises;
  const files = [];

  const realDir = await fsp.realpath(targetPath);
  if (visitedDirs.has(realDir)) {
    return files;
  }
  visitedDirs.add(realDir);

  const dirEntries = await fsp.readdir(targetPath);
  for (const fileName of dirEntries) {
    const filePath = path.join(targetPath, fileName);
    if (!includeHiddenFiles && isHiddenName(fileName)) {
      continue;
    }
    let entryStats = await fsp.lstat(filePath);

    if (entryStats.isSymbolicLink()) {
      let resolved;
      try {
        resolved = await fsp.realpath(filePath);
      } catch (error) {
        throw new Error(`Unable to resolve symbolic link in artifact: ${filePath}. ${error.message}`);
      }

      if (!isWithin(scanRoot, resolved)) {
        throw new Error(
          `Refusing to upload symbolic link ${filePath}: it resolves to ${resolved}, ` +
          `which is outside the scanned artifact path ${scanRoot}.`
        );
      }

      if (!includeHiddenFiles && hasHiddenSegment(path.relative(scanRoot, resolved))) {
        continue;
      }

      entryStats = await fsp.stat(resolved);
    }

    if (entryStats.isFile()) {
      files.push(filePath);
    } else if (entryStats.isDirectory()) {
      files.push(...(await collectFiles(filePath, scanRoot, includeHiddenFiles, visitedDirs)));
    }
  }

  return files;
}

module.exports = function ({ github, context, artifactName, artifactPath, retentionDays, compressionLevel, ifNoFilesFound, includeHiddenFiles }) {
  main(github, context, artifactName, artifactPath, retentionDays, compressionLevel, ifNoFilesFound, includeHiddenFiles);
}

module.exports.uploadArtifact = uploadArtifact;
