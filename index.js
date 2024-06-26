const { DefaultArtifactClient } = require("@actions/artifact");
const core = require('@actions/core');

async function main() {
  const artifact = new DefaultArtifactClient();

  const artifactName = core.getInput('name');
  const artifactPath = core.getInput('path');
  console.log(`Artifact path: ${artifactPath}`);
  console.log(`Workspace: ${process.env.GITHUB_WORKSPACE}`);


  try {
    await uploadArtifact(artifact, artifactName, artifactPath);
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function uploadArtifact(artifactClient, artifactName, artifactPath) {
  if (hasGitFolderWithGitHubRunnerToken(artifactPath)) {
    throw new Error("GITHUB_TOKEN must not be uploaded inside artifacts.");
  }

  const filesToUpload = await populateFilesWithFullPath(artifactPath);

  await artifactClient.uploadArtifact(
    artifactName,
    filesToUpload,
    process.env.GITHUB_WORKSPACE,
    { retentionDays: 10 } // Optional: Set retention days
  );
}

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

async function populateFilesWithFullPath(rootPath) {
  const fs = require('fs').promises; // Use promises for cleaner async/await usage
  const path = require('path');
  const files = [];

  const dirEntries = await fs.readdir(rootPath);
  for (const fileName of dirEntries) {
    const filePath = path.join(rootPath, fileName);

    const stats = await fs.stat(filePath);
    if (stats.isFile()) {
      files.push(filePath);
    } else if (stats.isDirectory()) {
      // Recursively collect files from subdirectories
      files.push(...(await populateFilesWithFullPath(filePath)));
    }
  }

  return files;
}

module.exports = ({github, context}) => {
  return context.payload.client_payload.value
}

main();
