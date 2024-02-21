const config = require('config');

const { start } = require('./RTCStatsServer');
const FeaturesPublisher = require('./database/FeaturesPublisher');
const FirehoseConnector = require('./database/FirehoseConnector');
const logger = require('./logging');
const DynamoDataSender = require('./store/DynamoDataSender');
const MetadataStorageHandler = require('./store/MetadataStorageHandler');

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
