# Prover9-Mace4 Web UI

A React-based web interface for Prover9 and Mace4 automated reasoning tools. This application provides a modern, responsive user interface to work with Prover9 (an automated theorem prover) and Mace4 (a model finder).

## Features

- Input formulas with syntax highlighting
- Configure Prover9 and Mace4 options
- Run multiple processes simultaneously
- Real-time process monitoring
- View and download results
- Format outputs for better readability

## Prerequisites

- Node.js 16.x or higher
- npm 8.x or higher
- Access to the Prover9-Mace4 API server (Python backend)

## Installation

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/prover9-mace4-web.git
   cd prover9-mace4-web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the API configuration:
   ```
   REACT_APP_API_URL=http://localhost:8000
   ```

4. Start the development server:
   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Production Setup with Docker

The application can be run using Docker and docker-compose. The setup includes both the React frontend and the Python API server.

1. Make sure Docker and docker-compose are installed on your system

2. Build and run the containers:
   ```bash
   docker-compose up -d
   ```

3. Access the application at [http://localhost](http://localhost)

## Adapting Docker Files

### Dockerfile

The included Dockerfile builds the React application and serves it using Nginx. It uses a multi-stage build to keep the final image small:

1. The first stage builds the React application with Node.js
2. The second stage uses Nginx to serve the static files

You can customize the Nginx configuration by uncommenting and modifying the line:
```
# COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### docker-compose.yml

The docker-compose.yml file sets up two services:

1. `api` - The Python API server
2. `web` - The React frontend

Key configuration points:
- The API server is exposed on port 8000
- The web UI is exposed on port 80
- The Samples directory is mounted as a volume for the API service
- The environment variables are configured for communication between services

## .gitignore and .dockerignore

The included `.gitignore` and `.dockerignore` files are configured for a typical React application with some additional patterns for development tools. 

You can add additional patterns if you're using specific tooling or have additional files that shouldn't be tracked.

## API Communication

The application communicates with the API server to:
- Parse and validate inputs
- Run Prover9 and Mace4 processes
- Monitor running processes
- Retrieve and format outputs

The API URL is configured through environment variables and can be adjusted for different deployment scenarios.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
