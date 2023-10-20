const JSONStream = require('JSONStream');
const assert = require('assert').strict;
const config = require('config');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { pipeline } = require('stream');
const WebSocket = require('ws');

const { name: appName, version: appVersion } = require('../package');

const AmplitudeConnector = require('./database/AmplitudeConnector');
const FeaturesPublisher = require('./database/FeaturesPublisher');
const FirehoseConnector = require('./database/FirehoseConnector');
const DemuxSink = require('./demux');
const logger = require('./logging');
const PromCollector = require('./metrics/PromCollector');
const S3Manager = require('./store/S3Manager');
const { saveEntryAssureUnique } = require('./store/dynamo');
const { ClientManager } = require('./utils/ClientManager');
const { asyncDeleteFile,
    getEnvName,
    getIdealWorkerCount,
    RequestType,
    ResponseType,
    extractTenantDataFromUrl,
    obfuscatePII,
    isSessionOngoing,
    isSessionReconnect } = require('./utils/utils');
const AwsSecretManager = require('./webhooks/AwsSecretManager');
const WebhookSender = require('./webhooks/WebhookSender');
const WorkerPool = require('./worker-pool/WorkerPool');

let amplitude;
let store;
let featPublisher;
let tempPath;
let webhookSender;
let secretManager;

/**
 * Store the dump to the configured store. The dump file might be stored under a different
 * name, this is to account for the reconnect mechanism currently in place.
 *
 * @param {string} clientId - name that the dump file will actually have on disk.
 * @param {string} uniqueClientId - name that the dump will have on the store.
 */
async function storeDump(sinkMeta, uniqueClientId) {

    const {
        clientId,
        isJaaSTenant
    } = sinkMeta;

    const dumpPath = `${tempPath}/${clientId}`;
    const { webhooks: { sendRtcstatsUploaded } = { sendRtcstatsUploaded: false } } = config;

    try {

        logger.info(`[S3] Storing dump ${uniqueClientId} with path ${dumpPath}`);

        await store?.put(uniqueClientId, dumpPath);

        if (isJaaSTenant && sendRtcstatsUploaded && webhookSender) {
            const signedLink = await store?.getSignedUrl(uniqueClientId);

            webhookSender.sendRtcstatsUploadedHook(sinkMeta, signedLink);
        }
    } catch (err) {
        PromCollector.storageErrorCount.inc();

        logger.error('Error storing: %s uniqueId: %s - %s', dumpPath, uniqueClientId, err);
    } finally {
        await asyncDeleteFile(dumpPath);
    }
}

/**
 * Persist the dump file to the configured store and save the  associated metadata. At the time of writing the
 * only supported store for metadata is dynamo.
 *
 * @param {Object} sinkMeta - metadata associated with the dump file.
 */
async function persistDumpData(sinkMeta) {

    // Metadata associated with a dump can get large so just select the necessary fields.
    const { clientId } = sinkMeta;
    let uniqueClientId = clientId;

    // Because of the current reconnect mechanism some files might have the same clientId, in which case the
    // underlying call will add an associated uniqueId to the clientId and return it.
    uniqueClientId = await saveEntryAssureUnique(sinkMeta);

    // Store the dump file associated with the clientId using uniqueClientId as the key value. In the majority of
    // cases the input parameter will have the same values.
    storeDump(sinkMeta, uniqueClientId ?? clientId);
}

const workerScriptPath = path.join(__dirname, './worker-pool/ExtractWorker.js');
const workerPool = new WorkerPool(workerScriptPath, getIdealWorkerCount());

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

    persistDumpData(dumpInfo);

});

workerPool.on(ResponseType.ERROR, body => {
    const { dumpInfo = {}, error } = body;
    const obfuscatedDumpInfo = obfuscatePII(dumpInfo);

    logger.error('[App] Handling ERROR event for: %o, error: %o', obfuscatedDumpInfo, error);

    PromCollector.processErrorCount.inc();

    // If feature extraction failed at least attempt to store the dump in s3.
    if (dumpInfo.clientId) {
        persistDumpData(dumpInfo);
    } else {
        logger.error('[App] Handling ERROR without a clientId field!');
    }
});

/**
 * Initialize the service which will persist the dump files.
 */
function setupDumpStorage() {
    if (config.s3?.region && config.s3?.bucket) {
        store = new S3Manager(config.s3);
    } else {
        logger.warn('[App] S3 is not configured!');
    }
}

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
 * Initialize the directory where temporary dump files will be stored.
 */
function setupWorkDirectory() {
    try {
        // Temporary path for stats dumps must be configured.
        assert(tempPath);

        if (fs.existsSync(tempPath)) {
            fs.readdirSync(tempPath).forEach(fname => {
                try {
                    logger.debug(`[App] Removing file ${`${tempPath}/${fname}`}`);
                    fs.unlinkSync(`${tempPath}/${fname}`);
                } catch (e) {
                    logger.error(`[App] Error while unlinking file ${fname} - ${e}`);
                }
            });
        } else {
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
 * Main handler for web socket connections.
 * Messages are sent through a node stream which saves them to a dump file.
 * After the websocket is closed the session is considered as terminated and the associated dump
 * is queued up for feature extraction through the {@code WorkerPool} implementation.
 *
 * @param {*} client
 * @param {*} upgradeReq
 */
function wsConnectionHandler(client, upgradeReq) {
    try {
        PromCollector.connected.inc();

        const clientManager = new ClientManager(client, upgradeReq);
        const clientDetails = clientManager.getDetails();
        const {
            userAgent,
            clientProtocol,
            url,
            statsFormat,
            clientType
        } = clientDetails;

        logger.info(
            '[App] New app connected: user-agent: %s, protocol: %s, url: %s',
            userAgent,
            clientProtocol,
            url
        );

        // The if statement is used to maintain compatibility with the reconnect functionality on the client
        // it should be removed once the server also supports this functionality.
        // TODO: Remove once reconnect is added to server
        if (isSessionOngoing(url, tempPath) || isSessionReconnect(url)) {
            logger.warn(`[APP] Reconnect not supported, closing connection for ${url}`);

            client.close(3001);

            return;
        }

        const demuxSinkOptions = {
            clientDetails,
            dumpFolder: tempPath,
            log: logger
        };

        const demuxSink = new DemuxSink(demuxSinkOptions);

        demuxSink.on('close-sink', ({ id, meta }) => {
            const { confID = '' } = meta;
            const tenantInfo = extractTenantDataFromUrl(confID);

            // Metadata associated with a dump can get large so just select the necessary fields.
            const dumpData = {
                app: meta.applicationName || 'Undefined',
                clientId: id,
                clientType,
                conferenceId: meta.confName,
                conferenceUrl: meta.confID,
                dumpPath: meta.dumpPath,
                endDate: Date.now(),
                endpointId: meta.endpointId,
                startDate: meta.startDate,
                sessionId: meta.meetingUniqueId,
                userId: meta.displayName,
                ampSessionId: meta.sessionId,
                ampUserId: meta.userId,
                ampDeviceId: meta.deviceId,
                statsFormat,
                isBreakoutRoom: meta.isBreakoutRoom,
                breakoutRoomId: meta.roomId,
                parentStatsSessionId: meta.parentStatsSessionId,
                ...tenantInfo
            };

            PromCollector.collectClientDumpSizeMetrics(dumpData);

            const obfuscatedDumpData = obfuscatePII(dumpData);

            logger.info('[App] Processing dump id %s, metadata %o', id, obfuscatedDumpData);

            // Don't process dumps generated by JVB & Jigasi, there should be a more formal process to
            if (clientManager.supportsFeatureExtraction()) {
                // Add the clientId in the worker pool so it can process the associated dump file.
                workerPool.addTask({
                    type: RequestType.PROCESS,
                    body: dumpData
                });
            } else {
                persistDumpData(dumpData);
            }
        });

        const connectionPipeline = pipeline(
        WebSocket.createWebSocketStream(client),
        JSONStream.parse(),
        demuxSink,
        err => {
            if (err) {
                // A pipeline can multiplex multiple sessions however if one fails
                // the whole pipeline does as well,
                PromCollector.sessionErrorCount.inc();

                logger.error('[App] Connection pipeline: %o;  error: %o', clientDetails, err);
            }
        });

        connectionPipeline.on('finish', () => {
            logger.info('[App] Connection pipeline successfully finished %o', clientDetails);

            // We need to explicity close the ws, you might notice that we don't do the same in case of an error
            // that's because in that case the error will propagate up the pipeline chain and the ws stream will also
            // close the ws.
            client.close();
        });

        // Let the reconnect enabled client that we are ready to receive data.
        // TODO: Remove once reconnect is added to server
        client.send(JSON.stringify({
            type: 'sn',
            body: {
                value: 0,
                state: 'initial'
            }
        }));

        client.on('error', e => {
            logger.error('[App] Websocket error: %s', e);
            PromCollector.connectionError.inc();
        });

        client.on('close', () => {
            PromCollector.connected.dec();
        });
    } catch (error) {
        logger.error('[App] Error while handling ws connection: %o', error);
    }
}

/**
 *
 * @param {*} wsServer
 */
function setupWebSocketsServer(wsServer) {
    const wss = new WebSocket.Server({ server: wsServer });

    wss.on('connection', wsConnectionHandler);
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

    setupWebSocketsServer(server);
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

    tempPath = config.server.tempPath;

    setupSecretManager();
    await setupWebhookSender();
    setupWorkDirectory();
    setupDumpStorage();
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
