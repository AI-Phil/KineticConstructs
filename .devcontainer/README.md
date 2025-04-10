# Codespaces Configuration for Kinetic Constructs

This directory contains the configuration for running the Kinetic Constructs project in GitHub Codespaces.

## Required Secrets

Before launching the codespace, or shortly after, you **must** configure the following repository or user secrets for Codespaces:

1.  `ASTRA_DB_API_ENDPOINT`: Your Astra DB API endpoint URL.
2.  `ASTRA_DB_TOKEN`: Your Astra DB Application Token (starting with `AstraCS:...`).

These secrets are necessary for the application to connect to the database.

Refer to the [GitHub Codespaces documentation on managing secrets](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-encrypted-secrets-for-your-codespaces) for instructions on how to add them.

## Getting Started

Once the secrets are configured:

1.  Create a new Codespace for this repository.
2.  The environment will automatically build based on `.devcontainer/devcontainer.json`. This includes installing Node.js, Python, and project dependencies.
3.  Once the Codespace is ready, the application dependencies will be installed via the `postCreateCommand`.
4.  You can start the application by running the following command in the terminal:

    ```bash
    npm start
    ```

5.  Codespaces will automatically detect that the application is running on port 3000 and prompt you to open it in a browser. 