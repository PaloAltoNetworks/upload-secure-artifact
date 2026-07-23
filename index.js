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

function isFile(inputPath) {
  return fs.lstatSync(inputPath).isFile();
}

async function uploadArtifact(artifactClient, artifactName, artifactPath, retentionDays, compressionLevel, ifNoFilesFound = DEFAULT_IF_NO_FILES_FOUND, includeHiddenFiles) {
  const paths = parseArtifactPaths(artifactPath);
  const filesToUpload = [];
  const includeHidden = String(includeHiddenFiles).toLowerCase() === 'true';

  for (const singlePath of paths) {
    if (!fs.existsSync(singlePath)) {
      continue;
    }

    const foundPath = hasGitFolderWithGitHubRunnerToken(singlePath);
    if (foundPath) {
      throw new Error(`Found GITHUB_TOKEN in artifact, under path ${foundPath}`);
    }

    if (isFile(singlePath)) {
      filesToUpload.push(singlePath);
      continue;
    }

    filesToUpload.push(...(await collectFiles(singlePath, includeHidden)));
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
  if (Number.isInteger(parsedRetentionDays) && parsedRetentionDays > 0) {
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

    const files = fs.readdirSync(startPath);

    for (const fileName of files) {
      const filePath = path.join(startPath, fileName);

      if (fileName === '.git' && fs.statSync(filePath).isDirectory()) {
        return filePath;
      }

      if (fs.statSync(filePath).isDirectory()) {
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
  const regex = new RegExp('eC1hY2Nlc3MtdG9rZW46Z2hz', 'i');

  try {
    if (fs.existsSync(configFile)) {
      const configContent = fs.readFileSync(configFile, 'utf-8');
      if (regex.test(configContent)) {
        return configFile;
      }
    }
  } catch (error) {
    console.error('Error checking Git config:', error);
    return null;
  }

  return null;
}

async function collectFiles(targetPath, includeHiddenFiles) {
  const fsp = fs.promises;
  const files = [];

  const stats = await fsp.stat(targetPath);
  if (stats.isFile()) {
    files.push(targetPath);
    return files;
  }

  if (!stats.isDirectory()) {
    return files;
  }

  const dirEntries = await fsp.readdir(targetPath);
  for (const fileName of dirEntries) {
    const filePath = path.join(targetPath, fileName);
    const entryStats = await fsp.stat(filePath);

    if (entryStats.isFile()) {
      if (includeHiddenFiles || !isHiddenFile(filePath)) {
        files.push(filePath);
      }
    } else if (entryStats.isDirectory()) {
      files.push(...(await collectFiles(filePath, includeHiddenFiles)));
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
