# Base image with Python 3.11
FROM mcr.microsoft.com/devcontainers/python:0-3.11-bullseye

ARG USERNAME=vscode

# Set up Rust, uv, and system tools
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

USER root

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg git procps sudo \
    build-essential pkg-config libssl-dev cmake libclang-dev && \
    # Install uv
    pip install uv && \
    # Install Rust
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
      sh -s -- --default-toolchain stable --no-modify-path -y && \
    chown -R ${USERNAME}:${USERNAME} ${RUSTUP_HOME} ${CARGO_HOME} && \
    # Clean up
    apt-get clean && rm -rf /var/lib/apt/lists/*

USER ${USERNAME}

# Preinstall Python dependencies globally (if desired)
COPY pyproject.toml ./
RUN uv pip install --system . && uv cache clean
