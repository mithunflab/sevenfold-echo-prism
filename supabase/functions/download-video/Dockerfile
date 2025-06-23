
FROM denoland/deno:1.37.2

# Install yt-dlp and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy function files
COPY . .

# Cache dependencies
RUN deno cache index.ts

# Run the function
CMD ["deno", "run", "--allow-all", "index.ts"]
