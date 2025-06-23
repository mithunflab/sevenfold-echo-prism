
FROM denoland/deno:1.37.2

# Update package list and install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment and install yt-dlp
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --upgrade pip && pip install yt-dlp

# Verify installations
RUN yt-dlp --version && ffmpeg -version

# Set working directory
WORKDIR /app

# Copy function files
COPY . .

# Cache dependencies
RUN deno cache index.ts

# Run the function
CMD ["deno", "run", "--allow-all", "index.ts"]
