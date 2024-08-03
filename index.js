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

async function uploadArtifact(artifactClient, artifactName, artifactPath,retentionDays,compressionLevel) {
  foundPath = hasGitFolderWithGitHubRunnerToken(artifactPath)
  if (foundPath) {
    throw new Error(`Found GITHUB_TOKEN in artifact, under path ${foundPath}`);
  }                

  const filesToUpload = await populateFilesWithFullPath(artifactPath);

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

module.exports = function ({ github, context , artifactName,artifactPath,retentionDays,compressionLevel }) { 
   main(github, context, artifactName,artifactPath,retentionDays,compressionLevel);
}



