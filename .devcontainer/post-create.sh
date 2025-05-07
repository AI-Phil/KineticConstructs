#!/bin/bash
set -e

# Create .env file if it doesn't exist
if [ ! -f /workspaces/KineticConstructs/.env ]; then
  if [ -f /workspaces/KineticConstructs/.env.example ]; then
    cp /workspaces/KineticConstructs/.env.example /workspaces/KineticConstructs/.env
    echo ".env created from .env.example"
  else
    echo ".env.example not found, skipping .env creation."
  fi
fi

# Move pre-built node_modules if conditions are met
PROJECT_WORKSPACE_ROOT="/workspaces/KineticConstructs"
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