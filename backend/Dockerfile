# ─────────────────────────────────────────────────────────
# GestureExplorer Elite — Backend Dockerfile
# Python 3.11 + Flask + SocketIO + MediaPipe + OpenCV
# ─────────────────────────────────────────────────────────

FROM python:3.11-slim

# Install system dependencies required by OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy and install Python dependencies first (for layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir gunicorn eventlet

# Copy the rest of the backend source code
COPY . .

# Create upload and sample_data directories
RUN mkdir -p uploads sample_data

# Expose Flask port
EXPOSE 5000

# Start with gunicorn + eventlet worker (required for Flask-SocketIO)
CMD ["gunicorn", "--worker-class", "eventlet", "-w", "1", \
     "--bind", "0.0.0.0:5000", \
     "--timeout", "120", \
     "--log-level", "info", \
     "app:app"]
