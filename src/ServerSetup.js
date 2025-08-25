const config = require('config');
const fs = require('fs');
const http = require('http');
const https = require('https');

const logger = require('./logging');
const PromCollector = require('./metrics/PromCollector');


/**
 * Initialize http server exposing prometheus statistics.
 */
function setupMetricsServer(workerPool) {
    const { metrics: port } = config.get('server');

    if (!port) {
        logger.warn('[App] Metrics server is not configured!');

        return;
    }

    const metricsServer = http
        .createServer((request, response) => {
            switch (request.url) {
            case '/metrics':
                PromCollector.queueSize.set(workerPool.getTaskQueueSize());
                PromCollector.collectDefaultMetrics();
                response.writeHead(200, { 'Content-Type': PromCollector.getPromContentType() });
                response.end(PromCollector.metrics());
                break;
            default:
                response.writeHead(404);
                response.end();
            }
        })
        .listen(port);

    return metricsServer;
}

/**
 * Handler used for basic availability checks.
 *
 * @param {*} request
 * @param {*} response
 */
function serverHandler(request, response) {
    switch (request.url) {
    case '/healthcheck':
        response.writeHead(200);
        response.end();
        break;
    case '/bindcheck':
        logger.info('Accessing bind check!');
        response.writeHead(200);
        response.end();
        break;
    default:
        response.writeHead(404);
        response.end();
    }
}

/**
 * In case one wants to run the server locally, https is required, as browsers normally won't allow non
 * secure web sockets on a https domain, so something like the bello
 * server instead of http.
 *
 * @param {number} port
 */
function setupHttpsServer(port) {
    const { keyPath, certPath } = config.get('server');

    if (!(keyPath && certPath)) {
        throw new Error('[App] Please provide certificates for the https server!');
    }

    const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };

    return https.createServer(options, serverHandler).listen(port);
}

/**
 *
 */
function setupHttpServer(port) {
    return http.createServer(serverHandler).listen(port);
}

/**
 * Initialize the http or https server used for websocket connections.
 */
function setupWebServer(setupWebSocketsServer) {
    const { useHTTPS, port } = config.get('server');

    if (!port) {
        throw new Error('[App] Please provide a server port!');
    }

    let server;

    if (useHTTPS) {
        server = setupHttpsServer(port);
    } else {
        server = setupHttpServer(port);
    }

    setupWebSocketsServer(server);
}

module.exports = {
    setupMetricsServer,
    setupWebServer
};
