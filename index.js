const { DefaultArtifactClient } = require("@actions/artifact");
const fs = require('fs');
const path = require('path');
const core = require('@actions/core');

async function main(github, context, artifactName,artifactPath,retentionDays,compressionLevel) {
  const artifactClient = new DefaultArtifactClient();

  try {
    await uploadArtifact(artifactClient, artifactName, artifactPath,retentionDays,compressionLevel);
  } catch (error) {
    core.setFailed(error.message);
  }
}

function parseArtifactPaths(artifactPath) {
  if (!artifactPath) {
    return [];
  }
  // Support both the standard newline-separated convention used by
  // actions/upload-artifact and the pipe-separated convention this action
  // historically accepted. Trim and drop empty entries.
  return artifactPath
    .split(/[\r\n|]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

async function uploadArtifact(artifactClient, artifactName, artifactPath,retentionDays,compressionLevel) {
  const paths = parseArtifactPaths(artifactPath);
  if (paths.length === 0) {
    throw new Error('No artifact path provided.');
  }

  const filesToUpload = [];
  for (const singlePath of paths) {
    if (!fs.existsSync(singlePath)) {
      throw new Error(`Artifact path does not exist: ${singlePath}`);
    }

    const foundPath = hasGitFolderWithGitHubRunnerToken(singlePath);
    if (foundPath) {
      throw new Error(`Found GITHUB_TOKEN in artifact, under path ${foundPath}`);
    }

    filesToUpload.push(...(await collectFiles(singlePath)));
  }

  await artifactClient.uploadArtifact(
    artifactName,
    filesToUpload,
    process.env.GITHUB_WORKSPACE,
    { retentionDays: 10 } // Optional: Set retention days
  );
}


function findGitFolder(startPath) {
    if (!fs.existsSync(startPath)) {
        console.log("Start path does not exist.");
        return null;
    }

    // A single file cannot contain a .git folder; nothing to scan.
    if (!fs.statSync(startPath).isDirectory()) {
        return null;
    }

    const files = fs.readdirSync(startPath);

    for (let i = 0; i < files.length; i++) {
        const filePath = path.join(startPath, files[i]);

        if (files[i] === '.git' && fs.statSync(filePath).isDirectory()) {
            return filePath;
        }

        if (fs.statSync(filePath).isDirectory()) {
            const result = findGitFolder(filePath);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

function hasGitFolderWithGitHubRunnerToken(pathToCheck) {
  const fs = require('fs');
  const path = require('path');

  const gitDir = findGitFolder(pathToCheck, '.git');
  if (!gitDir) {
    // No .git folder found under the artifact path: nothing to inspect.
    return null;
  }
  const configFile = path.join(gitDir, 'config');
  const regex = new RegExp('eC1hY2Nlc3MtdG9rZW46Z2hz', 'i');

  try {
    if (fs.existsSync(gitDir) && fs.existsSync(configFile)) {
      const configContent = fs.readFileSync(configFile, 'utf-8');
      if (regex.test(configContent)) {      
          return configFile;
      }
    }
    } catch (error) {
      console.error('Error checking Git config:', error);
      return null;
    }
}

async function collectFiles(targetPath) {
  const fsp = require('fs').promises; // Use promises for cleaner async/await usage
  const path = require('path');
  const files = [];

  const stats = await fsp.stat(targetPath);
  if (stats.isFile()) {
    // A single file was provided directly.
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
      files.push(filePath);
    } else if (entryStats.isDirectory()) {
      // Recursively collect files from subdirectories
      files.push(...(await collectFiles(filePath)));
    }
  }

  return files;
}

module.exports = function ({ github, context , artifactName,artifactPath,retentionDays,compressionLevel }) { 
   main(github, context, artifactName,artifactPath,retentionDays,compressionLevel);
}



