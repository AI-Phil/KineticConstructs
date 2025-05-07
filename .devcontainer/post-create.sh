#!/bin/bash
set -e

PROJECT_WORKSPACE_ROOT="/workspaces/KineticConstructs"

# Create .env file if it doesn't exist
if [ ! -f "${PROJECT_WORKSPACE_ROOT}/.env" ]; then
  if [ -f "${PROJECT_WORKSPACE_ROOT}/.env.example" ]; then
    cp "${PROJECT_WORKSPACE_ROOT}/.env.example" "${PROJECT_WORKSPACE_ROOT}/.env"
    echo ".env created from .env.example"
  else
    echo ".env.example not found, skipping .env creation."
  fi
fi

# Ensure Langflow config directory exists and has correct permissions
LANGFLOW_CONFIG_PATH="${PROJECT_WORKSPACE_ROOT}/.langflow_config"
echo "Ensuring Langflow config directory exists at ${LANGFLOW_CONFIG_PATH}..."
mkdir -p "${LANGFLOW_CONFIG_PATH}"
# Ensure vscode user owns this directory
chown -R vscode:vscode "${LANGFLOW_CONFIG_PATH}"

# Move pre-built node_modules if conditions are met
IMAGE_NODE_MODULES_PATH="/workspace/node_modules"
PROJECT_NODE_MODULES_PATH="${PROJECT_WORKSPACE_ROOT}/node_modules"

echo "Checking for pre-built node_modules at ${IMAGE_NODE_MODULES_PATH}..."
if [ -d "${IMAGE_NODE_MODULES_PATH}" ]; then
  echo "Pre-built node_modules found."
  if [ ! -d "${PROJECT_NODE_MODULES_PATH}" ] || [ ! "$(ls -A "${PROJECT_NODE_MODULES_PATH}")" ]; then
    echo "Moving pre-built node_modules to ${PROJECT_NODE_MODULES_PATH}..."
    # Ensure target parent directory exists
    mkdir -p "${PROJECT_WORKSPACE_ROOT}"
    # Remove target if it's an empty directory
    if [ -d "${PROJECT_NODE_MODULES_PATH}" ]; then
      rm -rf "${PROJECT_NODE_MODULES_PATH}"
    fi
    mv "${IMAGE_NODE_MODULES_PATH}" "${PROJECT_NODE_MODULES_PATH}"
    echo "node_modules moved successfully."
  else
    echo "Skipping move: Target ${PROJECT_NODE_MODULES_PATH} already exists and is not empty."
  fi
else
  echo "No pre-built node_modules found at ${IMAGE_NODE_MODULES_PATH}. You might need to run npm install or npm ci in your project directory."
fi

echo "Post-create script finished." 