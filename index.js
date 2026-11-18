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
const GITHUB_RUNNER_TOKEN_REGEX = /eC1hY2Nlc3MtdG9rZW46Z2hz/i;

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

// Checks a file selected for upload that is (or resolves to) a .git/config
// file, which covers direct file inputs and links that findGitFolder misses.
function gitConfigFileWithGitHubRunnerToken(filePath) {
  let resolved;
  try {
    resolved = fs.realpathSync(filePath);
  } catch (error) {
    throw new Error(`Unable to resolve artifact file: ${filePath}. ${error.message}`);
  }

  if (path.basename(resolved) !== 'config' || path.basename(path.dirname(resolved)) !== '.git') {
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
    if (rootStats.isFile()) {
      filesToUpload.push(singlePath);
      continue;
    }

    if (!rootStats.isDirectory()) {
      throw new Error(`Artifact path is not a regular file or directory: ${singlePath}`);
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

function findGitFolder(startPath) {
  try {
    if (!fs.existsSync(startPath) || !fs.statSync(startPath).isDirectory()) {
      return null;
    }

    // Use lstat semantics (Dirent) and do not descend into symlinked
    // directories: links that escape the root are rejected later, and links
    // inside the root point at directories this walk already visits. This
    // also prevents symlink loops from aborting the search early.
    const entries = fs.readdirSync(startPath, { withFileTypes: true });

    for (const entry of entries) {
      const filePath = path.join(startPath, entry.name);

      if (entry.name === '.git' && entry.isDirectory()) {
        return filePath;
      }

      if (entry.isDirectory()) {
        const result = findGitFolder(filePath);
        if (result) {
          return result;
        }
      }
    }
  } catch (error) {
    console.log(error);
  }

  return null;
}

function hasGitFolderWithGitHubRunnerToken(pathToCheck) {
  const gitDir = findGitFolder(pathToCheck);
  if (!gitDir) {
    return null;
  }

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
    return null;
  }

  return null;
}

// Recursively collects regular files under targetPath. Entries are inspected
// with lstat so symbolic links are never followed blindly: a link is only
// accepted when its fully resolved target stays inside scanRoot (the
// canonical path the secrets scanner inspected). Links that escape it are
// rejected so the uploaded bytes always match the scanned bytes.
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

      entryStats = await fsp.stat(resolved);
    }

    if (entryStats.isFile()) {
      if (includeHiddenFiles || !isHiddenFile(filePath)) {
        files.push(filePath);
      }
    } else if (entryStats.isDirectory()) {
      files.push(...(await collectFiles(filePath, scanRoot, includeHiddenFiles, visitedDirs)));
    }
  }

  return files;
}

function isHiddenFile(filePath) {
  return path.basename(filePath).startsWith('.');
}

module.exports = function ({ github, context, artifactName, artifactPath, retentionDays, compressionLevel, ifNoFilesFound, includeHiddenFiles }) {
  main(github, context, artifactName, artifactPath, retentionDays, compressionLevel, ifNoFilesFound, includeHiddenFiles);
}

module.exports.uploadArtifact = uploadArtifact;
