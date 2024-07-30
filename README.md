<img src="logo-artifact.jpeg"> 


# Upload secure artifact

This GitHub Action scans artifacts for secrets using [gitleaks](https://github.com/gitleaks/gitleaks) before uploading them. The upload functionality is done by wrapping the original [upload-artifact](https://github.com/actions/upload-artifact) GitHub action, ensuring that no sensitive information is included in the uploaded artifacts.

## Features

- Compatible with upload-artifact v4
- Alerts users if any secrets are detected
- Prevents uploading artifacts if secrets are found
- Wraps around the `upload-artifact` GitHub action for seamless integration

## Usage

To use this action add it to your GitHub Actions workflow file:

```yaml

    - uses: cider-research/upload-secure-artifact@main
       with:
         name: python-build
     	 path: /output

```

** _Pin your actions for a safer world_

## Inputs

- original upload-artifact inputs can be found [here](https://github.com/actions/upload-artifact?tab=readme-ov-file#inputs)

- scan-only-github-secrets (Optional)

	-	Description: If true, skip the gitleaks secrets scanning and only perform scanning for the runner token in the local .git folder.
	-	Default: false

## Outputs

-  artifact-id, artifact-url: supplied by the upload-artifact action


## Contributing

  Contributions are welcome! Please open an issue or submit a pull request if you have any improvements or suggestions.

## Contact

  For any questions or support, please open an issue on the GitHub repository.
