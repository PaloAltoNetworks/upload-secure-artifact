# Upload Artifact Secure

This GitHub Action scans artifacts for secrets using [truffleHog](https://github.com/trufflesecurity/trufflehog) before uploading them. The upload functionality is done by wrapping the original [upload-artifact](https://github.com/actions/upload-artifact) GitHub action, ensuring that no sensitive information is included in the uploaded artifacts.

## Features

- Compatible with upload-artifact v4
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
      uses: actions/checkout@v4


    - uses: cider-research-testing/upload-artifact-secure@main
       with:
         name: python-build
     	 path: /output

```
## Inputs

- original upload-artifact inputs can be found [here](https://github.com/actions/upload-artifact?tab=readme-ov-file#inputs)

- scan-only-github-secrets (Optional)

	-	Description: If true, uses Trufflehog’s GitHub detector only while ignoring the rest of the detectors.
	-	Default: false

## Outputs

- secrets_found: Indicates whether any secrets were found (true or false).

## License

  This project is licensed under the AGPL-3.0 License. See the LICENSE file for more information.

## Contributing

  Contributions are welcome! Please open an issue or submit a pull request if you have any improvements or suggestions.

## Acknowledgments

  - This action uses [truffleHog](https://github.com/trufflesecurity/trufflehog) to scan for secrets.
  - The artifact upload functionality is based on the [@actions/artifact](https://www.npmjs.com/package/@actions/artifact) libary that powers [upload-artifact](https://github.com/actions/upload-artifact) GitHub action.
  - Compatible with upload-artifact v4

## Contact

  For any questions or support, please open an issue on the GitHub repository.
