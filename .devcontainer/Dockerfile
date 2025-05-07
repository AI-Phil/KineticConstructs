# Base image with Python 3.11
FROM mcr.microsoft.com/devcontainers/python:0-3.11-bullseye

ARG USERNAME=vscode

# Set up Rust, uv, Node.js, and system tools
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

USER root

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    # Install system dependencies for Python, Rust, Node.js, and general tools
    apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg git procps \
    build-essential pkg-config libssl-dev cmake libclang-dev && \
    # Add NodeSource repository & install Node.js 20
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    NODE_MAJOR=20 && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    # Install uv
    pip install uv && \
    # Install Rust
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
      sh -s -- --default-toolchain stable --no-modify-path -y && \
    # Set permissions for Rust for the non-root user (vscode will own these)
    chown -R ${USERNAME}:${USERNAME} ${RUSTUP_HOME} ${CARGO_HOME} && \
    # Clean up apt caches
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create workspace and set it up for the vscode user
RUN mkdir -p /workspace && chown ${USERNAME}:${USERNAME} /workspace

# --- Python Dependencies Installation (as root for global site-packages) ---
# Copy pyproject.toml for Python dependencies
COPY pyproject.toml /tmp/pyproject.toml
# Install Python dependencies globally as root
# Force remove _distutils_hack to prevent permission issues during its reinstallation/update
RUN rm -rf /usr/local/lib/python3.11/site-packages/_distutils_hack \
    && cd /tmp && uv pip install --system . && uv cache clean && rm -rf /tmp/*

# --- Node.js Dependencies Installation (can be as vscode user in their WORKDIR) ---
# Switch to non-root user
USER ${USERNAME}
WORKDIR /workspace

# Copy package.json and package-lock.json first for npm
COPY --chown=${USERNAME}:${USERNAME} package.json package-lock.json* ./
# Install Node.js dependencies
RUN npm ci && npm cache clean --force

# Default command to keep the container running
CMD ["sleep", "infinity"]
