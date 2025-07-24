const config = require('config');

const logger = require('../logging');

const aws = require('./AWS');
const mongodb = require('./MongoDB');

/**
 * @returns {Object} An object containing the initialized services.
 * This includes:
 * - featuresPublisher: The service that publishes features.
 * - metadataStorageHandler: The service that handles metadata storage.
 * - webhookSender: The service that sends webhooks.
 * - dumpStorage: The service that stores dumps.
 */
async function setupServices() {

    const serviceType = config.server.serviceType;

    switch (serviceType) {
    case 'AWS': {
        logger.info('[App] Initializing AWS services...');

        const featuresPublisher = aws.setupFeaturesPublisher();
        const metadataStorageHandler = aws.setupMetadataStorageHandler();
        const secretManager = aws.setupSecretManager();
        const webhookSender = await aws.setupWebhookSender(secretManager);
        const dumpStorage = aws.setupDumpStorage();

        return {
            featuresPublisher,
            metadataStorageHandler,
            webhookSender,
            dumpStorage
        };
    }

    case 'MongoDB': {
        logger.info('[App] Initializing MongoDB services...');

        await mongodb.connectToMongoDB();
        const metadataStorageHandler = mongodb.setupMetadataStorageHandler();
        const dumpStorage = mongodb.setupDumpStorage();

        return {
            metadataStorageHandler,
            dumpStorage
        };
    }
    default:
        logger.warn(`[App] Unknown service type: ${serviceType}`);
        throw new Error(`Unknown service type: ${serviceType}`);
    }

}

module.exports = {
    setupServices
};
