const config = require('config');

const { start, stop } = require('./RTCStatsServer');
const FeaturesPublisher = require('./database/FeaturesPublisher');
const FirehoseConnector = require('./database/FirehoseConnector');
const logger = require('./logging');
const DynamoDataSender = require('./store/DynamoDataSender');
const MetadataStorageHandler = require('./store/MetadataStorageHandler');
const { exitAfterLogFlush } = require('./utils/utils');

/**
 * Close the server and exit the process.
 *
 * @param {*} exitCode - The exit code to use when exiting the process.
 */
async function closeServerAndExit(exitCode = 0) {
    stop();
    await exitAfterLogFlush(logger, exitCode);
}

process.on('uncaughtException', async err => {
    logger.error('[App] RTCStats server encountered an uncaught exception, exiting process with error: <%o>', err);
    await closeServerAndExit(logger, 1);
});

process.on('unhandledRejection', async reason => {
    logger.error('[App] RTCStats server encountered an unhandled rejection, exiting process with error: <%o>', reason);
    await closeServerAndExit(logger, 1);
});

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

        const featPublisher = new FeaturesPublisher(dbConnector, appEnvironment);

        return featPublisher;
    }

    logger.warn('[App] Firehose is not configured!');
}


/**
 * Initialize the service that will handle the storage of metadata entries.
 */
function setupMetadataStorageHandler() {
    const {
        dynamo: {
            tableName,
            endpoint
        } = {},
        s3: {
            region
        } = {}
    } = config;

    if (tableName && region) {
        const storageInterface = new DynamoDataSender(region, tableName, endpoint);

        return new MetadataStorageHandler(storageInterface);
    }

    logger.warn('[App] DynamoDB is not configured!');
}

const featuresPublisher = setupFeaturesPublisher();
const metadataStorageHandler = setupMetadataStorageHandler();

start(featuresPublisher, metadataStorageHandler);
