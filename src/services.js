const config = require('config');

const FeaturesPublisher = require('./database/FeaturesPublisher');
const FirehoseConnector = require('./database/FirehoseConnector');
const logger = require('./logging');
const DynamoDataSender = require('./store/DynamoDataSender');
const MetadataStorageHandler = require('./store/MetadataStorageHandler');
const S3Manager = require('./store/S3Manager');
const AwsSecretManager = require('./webhooks/AwsSecretManager');
const WebhookSender = require('./webhooks/WebhookSender');

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

/**
 * Initialize the service which will persist the dump files.
 *
 */
function setupDumpStorage() {
    let store;

    if (config.s3?.region && config.s3?.bucket) {
        store = new S3Manager(config.s3);
    } else {
        logger.warn('[App] S3 is not configured!');
    }

    return store;
}

/**
 * Initialize service that sends webhooks through the JaaS Webhook API.
 */
async function setupWebhookSender(secretManager) {
    const { webhooks: { apiEndpoint } } = config;
    let webhookSender;

    // If an endpoint is configured enable the webhook sender.
    if (apiEndpoint && secretManager) {
        webhookSender = new WebhookSender(config, secretManager);
        await webhookSender.init();
    } else {
        logger.warn('[App] Webhook sender is not configured');
    }

    return webhookSender;
}

/**
 * Initialize service responsible with retrieving required secrets..
 */
function setupSecretManager() {
    const { secretmanager: { region } = {} } = config;
    let secretManager;

    if (region) {
        secretManager = new AwsSecretManager(config);
    } else {
        logger.warn('[App] Secret manager is not configured');
    }

    return secretManager;
}

module.exports = {
    setupFeaturesPublisher,
    setupMetadataStorageHandler,
    setupDumpStorage,
    setupWebhookSender,
    setupSecretManager
};
