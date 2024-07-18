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
      uses: actions/checkout@v4


     - uses: cider-research-testing/upload-artifact-secure@main
       with:
	name: python-build
	path: /output

```
## Inputs

- name

	•	Description: Artifact name.
	•	Default: artifact

- path

	•	Description: A file, directory, or wildcard pattern that describes what to upload.
	•	Required: true

- scan-only-github-secrets

	•	Description: If true, uses Trufflehog’s GitHub detector only while ignoring the rest of the detectors.
	•	Default: false

- retention-days

	•	Description: Duration after which the artifact will expire in days. A value of 0 means using the default retention. The retention period can be:
	•	Minimum: 1 day
	•	Maximum: 90 days (unless changed from the repository settings page).

- compression-level

	•	Description: The level of compression for Zlib to be applied to the artifact archive. The value can range from 0 to 9:
	•	0: No compression
	•	1: Best speed
	•	6: Default compression (same as GNU Gzip)
	•	9: Best compression
Higher levels will result in better compression but will take longer to complete. For large files that are not easily compressed, a value of 0 is recommended for significantly faster uploads.
	•	Default: 6

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
