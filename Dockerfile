FROM python:3.12-slim AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Download and install LADR binaries
RUN mkdir -p /app/bin && \
    wget https://github.com/jamiewannenburg/ladr/releases/latest/download/ladr-linux.tar.gz -O ladr.tar.gz && \
    tar -xzf ladr.tar.gz -C /app/bin && \
    chmod +x /app/bin/* && \
    rm ladr.tar.gz

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.12-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 568 apps

# Set working directory
WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy the application code
COPY . . 
COPY --from=builder /app/bin /app/bin

# Create directories for Prover9-Mace4
RUN mkdir -p /app/bin && \
    chown -R apps:apps /app

# Set environment variables
ENV PYTHONPATH=/app
ENV PATH="/app/bin:${PATH}"

# Switch to non-root user
USER apps

# Expose ports
EXPOSE 8000

# The actual command will be specified in docker-compose.yml
CMD ["python", "api_server.py"] 