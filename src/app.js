const { start, stop } = require('./RTCStatsServer');
const logger = require('./logging');
const {
    setupFeaturesPublisher,
    setupMetadataStorageHandler,
    setupSecretManager,
    setupWebhookSender,
    setupDumpStorage
} = require('./services');
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
 * Starts the RTCStats server and initializes the services.
 */
async function main() {

    const featuresPublisher = setupFeaturesPublisher();
    const metadataStorageHandler = setupMetadataStorageHandler();
    const secretManager = setupSecretManager();
    const webhookSender = await setupWebhookSender(secretManager);
    const dumpStorage = setupDumpStorage();

    start({
        featuresPublisherParam: featuresPublisher,
        metadataStorageParam: metadataStorageHandler,
        webhookSenderParam: webhookSender,
        storeParam: dumpStorage
    });
}

main();
