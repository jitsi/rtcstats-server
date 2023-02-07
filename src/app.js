
const assert = require('assert').strict;
const config = require('config');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const { name: appName, version: appVersion } = require('../package');

const DumpPersister = require('./DumpPersister');
const OrphanFileHelper = require('./OrphanFileHelper');
const WsHandler = require('./WsHandler');
const AmplitudeConnector = require('./database/AmplitudeConnector');
const FeaturesPublisher = require('./database/FeaturesPublisher');
const FirehoseConnector = require('./database/FirehoseConnector');
const logger = require('./logging');
const PromCollector = require('./metrics/PromCollector');
const { getEnvName,
    getIdealWorkerCount,
    ResponseType,
    obfuscatePII } = require('./utils/utils');
const AwsSecretManager = require('./webhooks/AwsSecretManager');
const WebhookSender = require('./webhooks/WebhookSender');
const WorkerPool = require('./worker-pool/WorkerPool');

let amplitude;

let featPublisher;
let webhookSender;
let secretManager;
let tempDumpPath;

const { s3, features: {
    disableFeatExtraction,
    reconnectTimeout,
    sequenceNumberSendingInterval,
    cleanupCronIntervalMinutes }
} = config;

const workerScriptPath = path.join(__dirname, './worker-pool/ExtractWorker.js');
const workerPool = new WorkerPool(workerScriptPath, getIdealWorkerCount());

logger.info('[App] worker pool:', workerPool);
const dumpPersister = new DumpPersister({
    tempPath: getTempPath(),
    s3,
    disableFeatExtraction,
    webhookSender,
    config
});
const wsHandler = new WsHandler({
    tempPath: getTempPath(),
    reconnectTimeout,
    sequenceNumberSendingInterval,
    workerPool,
    config
});
const orphanFileHelper = new OrphanFileHelper({
    tempPath: getTempPath(),
    reconnectTimeout,
    wsHandler,
    cleanupCronIntervalMinutes
});

workerPool.on(ResponseType.DONE, body => {
    const { dumpInfo = {}, features = {} } = body;
    const obfuscatedDumpInfo = obfuscatePII(dumpInfo);

    try {
        logger.info('[App] Handling DONE event for %o', obfuscatedDumpInfo);

        const { metrics: { dsRequestBytes = 0,
            dumpFileSizeBytes = 0,
            otherRequestBytes = 0,
            statsRequestBytes = 0,
            sdpRequestBytes = 0,
            sentimentRequestBytes = 0,
            sessionDurationMs = 0,
            totalProcessedBytes = 0,
            totalProcessedCount = 0 } } = features;

        PromCollector.processed.inc();
        PromCollector.dsRequestSizeBytes.observe(dsRequestBytes);
        PromCollector.otherRequestSizeBytes.observe(otherRequestBytes);
        PromCollector.statsRequestSizeBytes.observe(statsRequestBytes);
        PromCollector.sdpRequestSizeBytes.observe(sdpRequestBytes);
        PromCollector.sessionDurationMs.observe(sessionDurationMs);
        PromCollector.sentimentRequestSizeBytes.observe(sentimentRequestBytes);
        PromCollector.totalProcessedBytes.observe(totalProcessedBytes);
        PromCollector.totalProcessedCount.observe(totalProcessedCount);
        PromCollector.dumpSize.observe(dumpFileSizeBytes);

        amplitude?.track(dumpInfo, features);
        featPublisher?.publish(body);
    } catch (e) {
        logger.error('[App] Handling DONE event error %o and body %o', e, obfuscatedDumpInfo);
    }

    dumpPersister.persistDumpData(dumpInfo);

});

workerPool.on(ResponseType.ERROR, body => {
    const { dumpInfo = {}, error } = body;
    const obfuscatedDumpInfo = obfuscatePII(dumpInfo);

    logger.error('[App] Handling ERROR event for: %o, error: %o', obfuscatedDumpInfo, error);

    PromCollector.processErrorCount.inc();

    // If feature extraction failed at least attempt to store the dump in s3.
    if (dumpInfo.clientId) {
        dumpPersister.persistDumpData(dumpInfo);
    } else {
        logger.error('[App] Handling ERROR without a clientId field!');
    }
});

/**
 * Configure Amplitude backend
 */
function setupAmplitudeConnector() {
    const { amplitude: { key } = {} } = config;

    if (key) {
        amplitude = new AmplitudeConnector(key);
    } else {
        logger.warn('[App] Amplitude is not configured!');
    }
}

/**
 * Initialize the service that will send extracted features to the configured database.
 */
function setupFeaturesPublisher() {
    const {
        firehose = {},
        server: {
            appEnvironment
        }
    } = config;

    // We use the `region` as a sort of enabled/disabled flag, if this config is set then so to must all other
    // parameters in the firehose config section, invariant check will fail otherwise and the server
    // will fail to start.
    if (firehose.region) {
        const dbConnector = new FirehoseConnector(firehose);

        featPublisher = new FeaturesPublisher(dbConnector, appEnvironment);
    } else {
        logger.warn('[App] Firehose is not configured!');
    }
}

/**
 *
 */
function getTempPath() {
    // Temporary path for stats dumps must be configured.
    const { server: { tempPath } } = config;

    if (tempDumpPath === undefined) {
        tempDumpPath = tempPath;
    }

    assert(tempDumpPath);

    return tempDumpPath;
}

/**
 * Initialize the directory where temporary dump files will be stored.
 */
function setupWorkDirectory() {
    const tempPath = getTempPath();

    try {
        if (!fs.existsSync(tempPath)) {
            logger.debug(`[App] Creating working dir ${tempPath}`);
            fs.mkdirSync(tempPath);
        }
    } catch (e) {
        logger.error(`[App] Error while accessing working dir ${tempPath} - ${e}`);

        // The app is probably in an inconsistent state at this point, throw and stop process.
        throw e;
    }
}


/**
 * Initialize http server exposing prometheus statistics.
 */
function setupMetricsServer() {
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
function setupWebServer() {
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

    wsHandler.setupWebSocketsServer(server);
}

/**
 * Initialize service that sends webhooks through the JaaS Webhook API.
 */
async function setupWebhookSender() {
    const { webhooks: { apiEndpoint } } = config;

    // If an endpoint is configured enable the webhook sender.
    if (apiEndpoint && secretManager) {
        webhookSender = new WebhookSender(config, secretManager);
        await webhookSender.init();
    } else {
        logger.warn('[App] Webhook sender is not configured');
    }
}

/**
 * Initialize service responsible with retrieving required secrets..
 */
function setupSecretManager() {
    const { secretmanager: { region } = {} } = config;

    if (region) {
        secretManager = new AwsSecretManager(config);
    } else {
        logger.warn('[App] Secret manager is not configured');
    }
}

/**
 *
 */
async function startRtcstatsServer() {
    logger.info('[App] Initializing: %s; version: %s; env: %s ...', appName, appVersion, getEnvName());

    setupSecretManager();
    await setupWebhookSender();
    setupWorkDirectory();
    orphanFileHelper.processOldFiles();
    setupFeaturesPublisher();
    setupAmplitudeConnector();
    setupMetricsServer();
    setupWebServer();

    logger.info('[App] Initialization complete.');
}

/**
 * Currently used from test script.
 */
function stop() {
    process.exit();
}

// For now just log unhandled promise rejections, as the initial code did not take them into account and by default
// node just silently eats them.
process.on('unhandledRejection', reason => {
    logger.error('[App] Unhandled rejection: %s', reason);
});

startRtcstatsServer();

module.exports = {
    stop,

    // We expose the number of processed items for use in the test script
    PromCollector,
    workerPool
};
