# Codespaces Configuration for Kinetic Constructs

This directory contains the configuration for running the Kinetic Constructs project in GitHub Codespaces.

## Environment Setup (.env file)

This Codespace is configured to use a `.env` file for environment variables.

1.  When the Codespace starts, if a `.env` file doesn't exist in the root directory, a copy of `.env.example` will be created as `.env`.
2.  You **must** edit the `.env` file and replace the placeholder values with your actual Astra DB credentials:
    *   `ASTRA_DB_API_ENDPOINT`: Your Astra DB API endpoint URL.
    *   `ASTRA_DB_TOKEN`: Your Astra DB Application Token (starting with `AstraCS:...`).

*Important:* The `.env` file is included in `.gitignore` and should **not** be committed to the repository.

## Getting Started

1.  Create a new Codespace for this repository.
2.  The environment will automatically build based on `.devcontainer/devcontainer.json`, installing Node.js, Python, and project dependencies. It will also create a `.env` file from the example if needed.
3.  **Open the `.env` file** in the root directory and fill in your `ASTRA_DB_API_ENDPOINT` and `ASTRA_DB_TOKEN`.
4.  Once the `.env` file is correctly populated, start the application by running the following command in the terminal:

    ```bash
    node server.js
    ```

5.  Codespaces will automatically detect that the application is running on port 3000 and prompt you to open it in a browser. 