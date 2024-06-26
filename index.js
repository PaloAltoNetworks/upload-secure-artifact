const { DefaultArtifactClient } = require("@actions/artifact");
const core = require('@actions/core');
const artifact = new DefaultArtifactClient();

function hasGitFolderWithGitHubRunnerToken(pathToCheck) {
  const fs = require('fs');
  const path = require('path');
  const gitDir = path.join(pathToCheck, '.git');
  const configFile = path.join(gitDir, 'config');
  const regex = new RegExp('eC1hY2Nlc3MtdG9rZW46Z2hz', 'i');

  try {
    if (fs.existsSync(gitDir) && fs.existsSync(configFile)) {
      const configContent = fs.readFileSync(configFile, 'utf-8');
      return regex.test(configContent);
    } else {
      return false;
    }
  } catch (error) {
    console.error('Error checking Git config:', error);
    return false;
  }
}

async function uploadArtifact(artifact_name,path,retention_days,compression_level) {
    if (hasGitFolderWithGitHubRunnerToken(path)){
    throw new Error("GITHUB_TOKEN must not be uploaded inside artifacts.");
  }

  const filesToUpload = populateFilesWithFullPath(path)
  let response = await artifact.uploadArtifact(
    // name of the artifact
    artifact_name,
    // files to include (supports absolute and relative paths)
    filesToUpload,
    // root directory to capture file paths from
    process.env.GITHUB_WORKSPACE,
    {
      // optional: how long to retain the artifact
      // if unspecified, defaults to repository/org retention settings (the limit of this value)
      retentionDays: retention_days,
      compressionLevel: compression_level
    }
  );
}

function populateFilesWithFullPath(rootPath) {  
  const fs = require('fs');
  const path = require('path');
  const files = [];

  fs.readdirSync(rootPath).forEach(fileName => {
    const filePath = path.join(rootPath, fileName);

    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      files.push(filePath);
    } else if (stats.isDirectory()) {
      // Recursively collect files from subdirectories
      files.push(...populateFilesWithFullPath(filePath));
    }
  });

  return files;
}

const name = core.getInput('name');
const path = core.getInput('path');
const retention_days = core.getInput('retention-days');
const compression_level = core.getInput('compression-level');

console.log("artifact path : ${path}")
console.log("Workspace : ${process.env.GITHUB_WORKSPACE}")

uploadArtifact(name,path,retention_days,compression_level);





