# Dockerfile
FROM node:20-slim

# Install system dependencies (ffmpeg + yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3-pip \
    python3 \
    && pip3 install --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]