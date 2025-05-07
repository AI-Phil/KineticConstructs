# Use a base image with Python 3.11 pre-installed
FROM mcr.microsoft.com/devcontainers/python:0-3.11-bullseye

# Default user for this image is often 'vscode', adjust if necessary
ARG USERNAME=vscode
ARG USER_HOME=/home/${USERNAME}

# Define installation paths for Rust/Cargo
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

# Install Node.js 20.x, git, uv, Rust, build tools, and other tools as root in a single layer
USER root
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    # Install system dependencies
    apt-get install -y --no-install-recommends curl ca-certificates gnupg git procps sudo build-essential pkg-config libssl-dev cmake libclang-dev && \
    # Add NodeSource repository & install Node.js
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    NODE_MAJOR=20 && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    # Install uv globally
    pip install uv && \
    # Install Rust (cargo) into /usr/local/
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- --default-toolchain stable --no-modify-path -y && \
    # Change ownership of Rust installation dirs to the user
    chown -R ${USERNAME}:${USERNAME} ${RUSTUP_HOME} ${CARGO_HOME} && \
    # Clean up apt caches
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Switch back to non-root user
USER ${USERNAME}

# Set working directory
WORKDIR /workspace

# This chown is likely not needed as WORKDIR is created by the user now, 
# but leaving it doesn't hurt. Ensure user owns it before COPY.
USER root
RUN chown ${USERNAME}:${USERNAME} /workspace
USER ${USERNAME}

# Copy dependency definition files first for better caching
COPY --chown=${USERNAME}:${USERNAME} package.json package-lock.json* pyproject.toml uv.lock ./

# Install Node.js & Python dependencies, then clean caches in single RUN commands
RUN npm ci && npm cache clean --force && \
    uv sync --system --no-cache && uv cache clean

# Default command
CMD ["sleep", "infinity"]