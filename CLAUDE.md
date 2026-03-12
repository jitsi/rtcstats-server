# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

rtcstats-server is the server-side component of the rtcstats ecosystem that collects and processes WebRTC statistics from clients (browsers, Electron apps, React Native) and backend services (JVB, JIGASI, JICOFO). It receives real-time statistics over WebSocket connections, processes them through worker threads for feature extraction, and stores the results in configurable backends (AWS S3/DynamoDB or MongoDB/GridFS).

## Development Commands

### Running the server
```bash
npm start                    # Production mode
npm run debug               # Debug mode
npm run watch:dev           # Development mode with auto-reload
```

### Testing
```bash
npm test                    # Run all Jest tests
npm run integration         # Run integration test client
npm run test:fix            # Run extract tests with fix flag
```

### Linting
```bash
npm run lint                # Check for linting errors
npm run lint:fix            # Auto-fix linting errors
```

## Configuration

The server uses the [config](https://www.npmjs.com/package/config) module with YAML files in the `config/` directory:
- `default.yaml` - Base configuration with all available options
- `debug.yaml`, `production.yaml`, `test.yaml` - Environment-specific overrides
- `custom-environment-variables.yaml` - Maps environment variables to config values

Configuration is selected via the `NODE_ENV` environment variable (debug, production, test).

### Key Configuration Options

- `server.serviceType`: Either "AWS" or "MongoDB" - determines which backend services to initialize
- `server.tempPath`: Directory for temporary dump files (default: "temp")
- `server.port`: WebSocket server port (default: 3000)
- `server.metrics`: Prometheus metrics endpoint port (default: 8095)
- `features.disableFeatExtraction`: Disable feature extraction for testing

## Architecture

### Request Flow

1. **WebSocket Connection** (`RTCStatsServer.js:wsConnectionHandler`)
   - Client connects via WebSocket with protocol version in `Sec-WebSocket-Protocol` header
   - Protocol format: `{version}_{type}` (e.g., "3.0_LEGACY", "3.0_STANDARD", "3.0_JVB")
   - Connection metadata extracted by `ConnectionInformation` class

2. **Stream Processing** (`demux.js`)
   - Incoming JSON messages parsed and routed through `DemuxSink` stream
   - Each `statsSessionId` maps to a separate file sink (one dump file per session)
   - Handles four request types: `identity`, `stats-entry`, `close`, `keepalive`
   - 60-second timeout closes inactive connections/sessions
   - Dump files stored in `server.tempPath` directory

3. **Feature Extraction** (`worker-pool/`)
   - On session close, dump file queued for processing via `WorkerPool`
   - Worker threads execute `ExtractWorker.js` to extract features from dump files
   - `StandardFeatureExtractor` processes RTCSTATS client dumps
   - `BackendFeatureExtractor` processes backend service (JVB, JIGASI, JICOFO) dumps
   - Worker pool maintains configurable number of workers with automatic regeneration on crash

4. **Persistence** (`store/`, `database/`)
   - Features published to configured services (Amplitude, Firehose)
   - Metadata saved via `MetadataStorageHandler` (DynamoDB or MongoDB)
   - Dump files uploaded to storage (S3 or GridFS)
   - Webhooks sent for JaaS tenants when configured

### Service Initialization (`services/index.js`)

The `setupServices()` function initializes different services based on `server.serviceType`:

**AWS mode:**
- `FeaturesPublisher` - Publishes to Amplitude and/or Firehose
- `MetadataStorageHandler` - DynamoDB storage
- `WebhookSender` - Sends webhooks with JWT auth from AWS Secrets Manager
- `DumpStorage` - S3 storage

**MongoDB mode:**
- `MetadataStorageHandler` - MongoDB storage
- `DumpStorage` - GridFS storage

### Key Components

- **DemuxSink** (`demux.js`) - Stream that multiplexes multiple stat sessions over a single WebSocket, writing each session to a separate dump file
- **WorkerPool** (`worker-pool/WorkerPool.js`) - Manages worker threads for CPU-intensive feature extraction, keeps pool at target size even on worker crashes
- **QualityStatsCollector** (`features/quality-stats/`) - Extracts WebRTC quality metrics from getstats data
- **PromCollector** (`metrics/PromCollector.js`) - Prometheus metrics collection

### WebSocket Protocol (v3.0)

See `API.md` for full protocol details. Key points:

- All messages are JSON with required fields: `statsSessionId`, `type`, and optional `data`
- `identity` request establishes session metadata (conference, user, app)
- `stats-entry` contains WebRTC statistics (data must be stringified)
- `close` triggers feature extraction and persistence
- `keepalive` prevents 60-second timeout

### Reconnect Handling

Files with duplicate `statsSessionId` are saved with incremental suffix: `{id}_{i}` (e.g., `abc123_1`, `abc123_2`). The `MetadataStorageHandler.saveEntryAssureUnique()` method handles conflicts at the storage level using the same convention.

### Orphan Dump Processing

On startup, `setupWorkDirectory()` processes any dump files left in `server.tempPath` from previous runs, queuing them for feature extraction.

## Testing Patterns

Tests use Jest with mocks in `src/test/mock/` and `src/store/test/mock/`:
- Unit tests typically mock AWS SDK, MongoDB, and logging modules
- `test-utils.js` provides common test utilities
- Integration test client available via `npm run integration`

When implementing tests, place them in the appropriate directory:
- Feature-specific tests: `src/test/jest/`
- Storage tests: `src/store/test/jest/`
