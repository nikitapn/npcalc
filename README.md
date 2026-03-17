# NSCalc - Hydroponics Nutrient Solution Calculator

A comprehensive hydroponics nutrient solution calculator with an integrated SOCKS5 proxy over TLS WebSockets for secure remote access.

## Overview

NSCalc is a dual-purpose application that serves as:

1. **Hydroponics Calculator**: A web-based tool for calculating nutrient solutions, EC/TDS values, and managing hydroponic growing parameters
2. **Secure Proxy**: A SOCKS5 proxy server tunneled over TLS WebSockets for secure remote access and traffic routing

## Architecture

- **Backend**: C++ server using Boost.Beast for HTTP/WebSocket handling and NPRPC for RPC communication
- **Frontend**: Modern web client built with React and Svelte
- **Proxy Client**: Cross-platform Qt application for SOCKS5 proxy functionality
- **Database**: SQLite for data persistence
- **Security**: TLS encryption with self-signed certificate support for development

## Features

### Hydroponics Calculator
- ✅ Nutrient solution calculations
- ✅ EC/TDS value management
- ✅ Multi-user support with authentication
- ✅ Real-time chat functionality
- ✅ Solution history and data persistence
- ✅ Web-based responsive UI

### SOCKS5 Proxy
- ✅ SOCKS5 proxy over TLS WebSockets
- ✅ Cross-platform Qt client (Windows/Linux/macOS)
- ✅ Secure tunnel establishment
- ✅ Session management and callbacks
- ✅ Bidirectional data forwarding

## Quick Start

### Prerequisites
- CMake 3.20+
- C++20 compatible compiler (GCC 11+, Clang 13+, MSVC 2022)
- Node.js 16+ (for client build)
- Qt 6+ (for proxy client)
- OpenSSL
- Boost 1.83+

### Building the Project

```bash
# Clone and build
git clone <repository-url>
cd nscalc

# Configure and build
cmake -B .build_local -S . -DCMAKE_BUILD_TYPE=Debug
cmake --build .build_local

# Or use the convenience script
./01_build_app.sh
```

### Running the Server

```bash
# Start the hydroponics calculator server
./run.sh

# For debugging
./run.sh debug
```

The server will start on `https://archvm:8080` (or your configured hostname).

### Building and Running Proxy Client

```bash
# Build proxy client
cmake --build .build_local --target=proxy_client

# Run proxy client (connects to server and starts SOCKS5 on port 1080)
./.build_local/debug/proxy_client
```

## Project Structure

```
nscalc/
├── server/               # C++ backend server
│   ├── src/
│   │   ├── main.cpp     # Main server entry point
│   │   ├── services/    # Business logic and services
│   │   └── util/        # Utilities and thread pool
├── client/              # React/Svelte frontend
│   ├── src/
│   │   ├── App.svelte   # Main application component
│   │   ├── calculation/ # Calculation logic
│   │   ├── gui/         # UI components
│   │   └── rpc/         # RPC client code
├── proxy_client/        # Qt SOCKS5 proxy client
│   └── src/
│       ├── main.cpp     # Proxy client entry
│       ├── socks5.cpp   # SOCKS5 implementation
│       └── MainWindow.* # Qt GUI (if applicable)
├── external/nprpc/   # NPRPC framework
├── idl/                 # Interface definitions
├── docs/                # Documentation
├── certs/               # SSL certificates
└── sample_data/         # Sample database
```

## Configuration

### Server Configuration

The server accepts several command-line options:

```bash
--hostname <host>        # Server hostname (default: localhost)
--port <port>           # Server port (default: 8080)
--http-dir <path>       # Static files directory
--data-dir <path>       # Database directory
--use-ssl <0|1>         # Enable SSL/TLS
--public-key <path>     # SSL certificate file
--private-key <path>    # SSL private key file
--dh-params <path>      # Diffie-Hellman parameters
```

### SSL Certificate Setup

For development with self-signed certificates:

1. **Linux/macOS**: Certificates are in `certs/` directory
2. **Windows Testing**: See [Windows Certificate Setup Guide](docs/WINDOWS_CERTIFICATE_SETUP.md)

### Proxy Client Configuration

The proxy client connects to the NSCalc server and establishes a SOCKS5 proxy on local port 1080. Configure your applications to use:
- **Proxy Type**: SOCKS5
- **Host**: 127.0.0.1
- **Port**: 1080

## API and RPC

The application uses NPRPC (Nikita's Protocol RPC) for communication between client and server. Interface definitions are in the `idl/` directory:

- `nscalc.npidl`: Main calculator interfaces
- `proxy.npidl`: Proxy service interfaces
- `grow_journal.npidl`: Draft grow-journal/story interfaces for uploads and processed media playback

## Development

### Building for Development

```bash
# Configure with debug symbols
cmake -B .build_local -S . -DCMAKE_BUILD_TYPE=Debug -DOPT_NPRPC_SKIP_TESTS=ON

# Build specific targets
cmake --build .build_local --target=nscalc
cmake --build .build_local --target=proxy_client
```

### Frontend Development

```bash
cd client
npm install
npm run dev    # Development server
npm run build  # Production build
```

### Testing

```bash
# Test SOCKS5 functionality
python test_socks5.py

# HTTP stress testing
cd server
python http_stress_test.py
```

## Docker Support

The project includes Docker support for containerized deployment:

```bash
# Build development image
./00_build_docker_dev.sh

# Build application
./01_build_app.sh

# Package runtime
./02_pack_runtime.sh

# Deploy
./03_deploy.sh
```

## Security Features

- **TLS Encryption**: All communications encrypted with TLS 1.2+
- **Authentication**: User authentication for calculator access
- **Proxy Security**: SOCKS5 proxy tunneled over secure WebSockets
- **Session Management**: Secure session handling and timeouts

## Browser Compatibility

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

### Common Issues

1. **Certificate Warnings**: Install self-signed certificate in browser (see [Windows setup guide](docs/WINDOWS_CERTIFICATE_SETUP.md))
2. **Build Failures**: Ensure all dependencies are installed and C++20 support is available
3. **Local login stopped working**: Run `./reset-dev-auth.sh` to restore the seeded dev passwords in `sample_data/nscalc.db`.
3. **Proxy Connection Issues**: Check firewall settings and ensure server is running with SSL enabled

### Debug Mode

Run the server in debug mode for detailed logging:

```bash
./run.sh debug
```

### Logs and Diagnostics

- Server logs are output to console
- Client logs available in browser developer tools
- Proxy client logs to console/system tray

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.

## Architecture Details

### NPRPC Framework

The project uses a custom RPC framework (NPRPC) that provides:
- High-performance binary protocol
- WebSocket transport
- Automatic client/server stub generation
- Thread-safe operations

### Networking Stack

- **HTTP/HTTPS**: Boost.Beast for web server functionality
- **WebSockets**: Secure WebSocket connections for RPC
- **SOCKS5**: RFC 1928 compliant SOCKS5 implementation
- **SSL/TLS**: OpenSSL for encryption

### Database

- **Engine**: SQLite 3
- **Schema**: See `database/create.sql`
- **Sample Data**: Provided in `sample_data/`

## Performance

- **Concurrent Users**: Supports multiple simultaneous users
- **Memory Usage**: Optimized for low memory footprint
- **CPU Usage**: Multi-threaded design for efficient CPU utilization
- **Network**: Optimized binary protocol reduces bandwidth usage

---

**Project Status**: Active Development  
**Last Updated**: June 2025  
**Author**: Nikita (nikitapnn1@gmail.com)