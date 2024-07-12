# TruffleHog Secret Scan and Upload Artifact GitHub Action

This GitHub Action scans your repository for secrets using `truffleHog` before uploading any artifacts. By wrapping the original `upload-artifact` GitHub action, it ensures that no sensitive information is included in the uploaded artifacts.

## Features

- Scans repository for secrets using `truffleHog`
- Alerts users if any secrets are detected
- Prevents uploading artifacts if secrets are found
- Wraps around the `upload-artifact` GitHub action for seamless integration

## Usage

To use this action, add it to your GitHub Actions workflow file. Below is an example configuration:

```yaml
name: Secret Scan and Upload Artifacts

on: [push, pull_request]

jobs:
  scan-and-upload:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v3

    - name: Run TruffleHog scan
      uses: trufflesecurity/trufflehog@v3
      id: trufflehog
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}

    - name: Check for secrets
      if: steps.trufflehog.outputs.secrets_found == 'true'
      run: echo "Secrets found in the repository. Please remove them before uploading artifacts."

    - name: Upload Artifacts
      if: steps.trufflehog.outputs.secrets_found == 'false'
      uses: actions/upload-artifact@v3
      with:
        name: my-artifact
        path: path/to/artifacts
```
## Inputs

	•	github_token (required): GitHub token for accessing the repository. Typically, you can use ${{ secrets.GITHUB_TOKEN }}.

## Outputs

	•	secrets_found: Indicates whether any secrets were found (true or false).

## License

  This project is licensed under the AGPL-3.0 License. See the LICENSE file for more information.

## Contributing

  Contributions are welcome! Please open an issue or submit a pull request if you have any improvements or suggestions.

## Acknowledgments

  •	This action uses truffleHog to scan for secrets.
  •	The artifact upload functionality is based on the upload-artifact GitHub action.

## Contact

  For any questions or support, please open an issue on the GitHub repository.
