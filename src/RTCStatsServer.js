const JSONStream = require('JSONStream');
const assert = require('assert').strict;
const config = require('config');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const WebSocket = require('ws');

const { name: appName, version: appVersion } = require('../package');

const { setupMetricsServer, setupWebServer } = require('./ServerSetup');
const DemuxSink = require('./demux');
const logger = require('./logging');
const PromCollector = require('./metrics/PromCollector');
const { ConnectionInformation, ClientType } = require('./utils/ConnectionInformation');
const { asyncDeleteFile,
    getEnvName,
    getIdealWorkerCount,
    RequestType,
    ResponseType,
    obfuscatePII,
    isSessionOngoing,
    isSessionReconnect } = require('./utils/utils');
const WorkerPool = require('./worker-pool/WorkerPool');

let featPublisher;
let metadataStorage;
let tempPath;
let webhookSender;
let store;

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
async function persistDumpData(sinkMeta, features = {}) {
    // Metadata associated with a dump can get large so just select the necessary fields.
    const { clientId } = sinkMeta;
    let uniqueClientId = clientId;

    try {
        // Because of the current reconnect mechanism some files might have the same clientId, in which case the
        // underlying call will add an associated uniqueId to the clientId and return it.
        uniqueClientId = await metadataStorage?.saveEntryAssureUnique(sinkMeta, features);
    } catch (e) {
        logger.error('[App] Error while saving metadata for %s - %o', clientId, e);
    } finally {
        // Store the dump file associated with the clientId using uniqueClientId as the key value. In the majority of
        // cases the input parameter will have the same values.
        await storeDump(sinkMeta, uniqueClientId ?? clientId);
    }
}

const workerScriptPath = path.join(__dirname, './worker-pool/ExtractWorker.js');
const workerPool = new WorkerPool(workerScriptPath, getIdealWorkerCount());

workerPool.on(ResponseType.DONE, body => {
    const { dumpMetadata = {}, features = {} } = body;
    const obfuscatedDumpMeta = obfuscatePII(dumpMetadata);

    try {
        logger.info('[App] Handling DONE event with meta %o', obfuscatedDumpMeta);
        logger.debug('[App] Handling DONE event with features %o', features);
        PromCollector.processed.inc();
        PromCollector.collectClientDumpSizeMetrics(dumpMetadata);

        if (dumpMetadata.clientType === ClientType.RTCSTATS) {
            const { metrics: { dsRequestBytes = 0,
                otherRequestBytes = 0,
                statsRequestBytes = 0,
                sdpRequestBytes = 0,
                sentimentRequestBytes = 0,
                sessionDurationMs = 0,
                totalProcessedBytes = 0,
                totalProcessedCount = 0 } = {} } = features;

            PromCollector.dsRequestSizeBytes.observe(dsRequestBytes);
            PromCollector.otherRequestSizeBytes.observe(otherRequestBytes);
            PromCollector.statsRequestSizeBytes.observe(statsRequestBytes);
            PromCollector.sdpRequestSizeBytes.observe(sdpRequestBytes);
            PromCollector.sessionDurationMs.observe(sessionDurationMs);
            PromCollector.sentimentRequestSizeBytes.observe(sentimentRequestBytes);
            PromCollector.totalProcessedBytes.observe(totalProcessedBytes);
            PromCollector.totalProcessedCount.observe(totalProcessedCount);

            featPublisher?.publish(body);
        }
    } catch (e) {
        logger.error('[App] Handling DONE event error %o and body %o', e.stack, obfuscatedDumpMeta);
    }
    persistDumpData(dumpMetadata, features);
});

workerPool.on(ResponseType.ERROR, body => {
    const { dumpMetadata = {}, error } = body;
    const obfuscatedDumpMeta = obfuscatePII(dumpMetadata);

    logger.error('[App] Handling ERROR event for: %o, error: %o', obfuscatedDumpMeta, error);

    PromCollector.processErrorCount.inc();
    PromCollector.collectClientDumpSizeMetrics(dumpMetadata);

    // If feature extraction failed at least attempt to store the dump in s3.
    if (dumpMetadata.clientId) {
        persistDumpData(dumpMetadata);
    } else {
        logger.error('[App] Handling ERROR without a clientId field!');
    }
});

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
                    // Linux specific, ignore lost+found directory.
                    if (fname === 'lost+found') {
                        logger.info('[App] Ignoring lost+found dir');

                        return;
                    }

                    const dumpPath = `${tempPath}/${fname}`;

                    const dumpMetadata = {
                        dumpPath,
                        clientId: fname
                    };

                    logger.info('[App] Processing orphan dump %s', fname);

                    workerPool.addTask({
                        type: RequestType.PROCESS,
                        body: dumpMetadata
                    });
                } catch (e) {
                    logger.error('[App] Error while processing orphan dump %s - %o', fname, e);
                }
            });
        } else {
            logger.debug(`[App] Creating working dir ${tempPath}`);
            fs.mkdirSync(tempPath);
        }
    } catch (e) {
        logger.error('[App] Error while accessing working dir %s - %o', tempPath, e);

        // The app is probably in an inconsistent state at this point, throw and stop process.
        throw e;
    }
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

        client.on('error', e => {
            logger.error('[App] Websocket error: %s', e);
            PromCollector.connectionError.inc();
        });

        client.on('close', () => {
            PromCollector.connected.dec();
        });
        const { headers: { origin = '', 'user-agent': userAgent = '' } = { }, url: urlPath = '' } = upgradeReq;
        const { protocol: clientProtocol = '' } = client;
        const connectionInformation = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        const clientDetails = connectionInformation.getDetails();

        const { url } = clientDetails;

        logger.info(
            '[App] New app connected: client details: %o',
            clientDetails
        );

        // logger.info('[ADBG] URL: %s', url);

        // The if statement is used to maintain compatibility with the reconnect functionality on the client
        // it should be removed once the server also supports this functionality.
        // TODO: Remove once reconnect is added to server
        if (isSessionOngoing(url, tempPath) || isSessionReconnect(url)) {
            logger.warn(`[APP] Reconnect not supported, closing connection for ${url}`);

            client.close(3001);

            return;
        }

        const demuxSinkOptions = {
            connectionInformation,
            dumpFolder: tempPath,
            log: logger
        };

        const demuxSink = new DemuxSink(demuxSinkOptions);

        demuxSink.on('close-sink', ({ id, meta }) => {
            const { dumpPath } = meta;

            const dumpMetadata = {
                dumpPath,
                clientId: id
            };

            logger.info('[App] Processing dump id %s, client details %o', id, clientDetails);

            workerPool.addTask({
                type: RequestType.PROCESS,
                body: dumpMetadata
            });
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
            }
        );

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
 * Set the services used by the server.
 * @param {FeaturePublisher} featPublisherParam - The feature publisher instance.
 * @param {MetadataStorage} metadataStorageParam - The metadata storage instance.
 */
function setServices(featPublisherParam, metadataStorageParam) {
    featPublisher = featPublisherParam;
    metadataStorage = metadataStorageParam;
}

/**
 * Start the RTCStatsServer.
 *
 * @param {FeaturePublisher} featurePublisherParam - The feature publisher instance.
 * @param {MetadataStorage} metadataStorageParam - The metadata storage instance.
 * @param {WebhookSender} webhookSenderParam - The webhook sender instance.
 * @param {Store} storeParam - The store instance.
 */
function start({
    featurePublisherParam,
    metadataStorageParam,
    webhookSenderParam,
    storeParam
}) {
    logger.info('[App] Initializing: %s; version: %s; env: %s ...', appName, appVersion, getEnvName());

    tempPath = config.server.tempPath;

    // TODO All dependencies should be injected, this is a temporary solution.
    featPublisher = featurePublisherParam; // Pass the feature publisher instance
    metadataStorage = metadataStorageParam;
    webhookSender = webhookSenderParam;
    setupWorkDirectory();
    store = storeParam;
    setupMetricsServer(workerPool);
    setupWebServer(setupWebSocketsServer);

    logger.info('[App] Initialization complete.');
}

/**
 * Currently used from test script.
 * TODO Look into graceful shutdown.
 */
function stop() {
    // TODO Add graceful shutdown
    // This implies.
    // - Shutting down the server
    // - Closing all worker threads, we can forcefully close them
    // as their state is not important
    // - Add a queue of events on done and error, these don't necessarily need to be processed
    // we simply need the queued so we can control the number of concurrent tasks, thus on
    // receiving SIGINT or SIGTERM we can simply cancel the queue without the fear of having
    // ongoing tasks, e.g. a task async sent the metadata info but it didn't wait for the async delete
    // to finish.
    // - Close the logger.
    // - process.exit();
}

// We expose the number of processed items for use in the test script
module.exports = {
    setServices,
    stop,
    start,
    PromCollector,
    workerPool
};
