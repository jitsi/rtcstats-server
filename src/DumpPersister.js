
const logger = require('./logging');
const PromCollector = require('./metrics/PromCollector');
const { saveEntryAssureUnique } = require('./store/dynamo');
const initS3Store = require('./store/s3.js');
const { asyncDeleteFile, getDumpPath } = require('./utils/utils');

/**
 *
 */
class DumpPersister {
    /**
     *
     */
    constructor({ tempPath, s3Config, disableFeatExtraction, webhookSender, config }) {
        this.tempPath = tempPath;
        this.store = this.createDumpStorage(s3Config);
        this.disableFeatExtraction = disableFeatExtraction;
        this.webhookSender = webhookSender;
        this.config = config;
    }

    /**
     * Initialize the service which will persist the dump files.
     */
    createDumpStorage(s3Config) {
        if (s3Config?.region) {
            return initS3Store(s3Config);
        }
        logger.warn('[DumpPersister] S3 is not configured!');
    }

    /**
     * Persist the dump file to the configured store and save the  associated metadata. At the time of writing the
     * only supported store for metadata is dynamo.
     *
     * @param {Object} sinkMeta - metadata associated with the dump file.
     */
    async persistDumpData(sinkMeta) {

        // Metadata associated with a dump can get large so just select the necessary fields.
        const { clientId } = sinkMeta;
        let uniqueClientId = clientId;

        // Because of the current reconnect mechanism some files might have the same clientId, in which case the
        // underlying call will add an associated uniqueId to the clientId and return it.
        uniqueClientId = await saveEntryAssureUnique(sinkMeta);

        // Store the dump file associated with the clientId using uniqueClientId as the key value. In the majority of
        // cases the input parameter will have the same values.
        this.storeDump(sinkMeta, uniqueClientId ?? clientId);
    }

    /**
     * Store the dump to the configured store. The dump file might be stored under a different
     * name, this is to account for the reconnect mechanism currently in place.
     *
     * @param {string} sinkMeta - name that the dump file will actually have on disk.
     * @param {string} uniqueClientId - name that the dump will have on the store.
     */
    async storeDump(sinkMeta, uniqueClientId) {
        const {
            clientId,
            isJaaSTenant
        } = sinkMeta;


        const dumpPath = getDumpPath(this.tempPath, clientId);
        const { webhooks: { sendRtcstatsUploaded } = { sendRtcstatsUploaded: false } } = this.config;

        try {

            logger.info(`[S3] Storing dump ${uniqueClientId} with path ${dumpPath}`);

            await this.store?.put(uniqueClientId, dumpPath);

            if (isJaaSTenant && sendRtcstatsUploaded && this.webhookSender) {
                const signedLink = await this.store?.getSignedUrl(uniqueClientId);

                logger.info('[App] Signed url:', signedLink);

                this.webhookSender.sendRtcstatsUploadedHook(sinkMeta, signedLink);
            }
        } catch (err) {
            PromCollector.storageErrorCount.inc();

            logger.error('Error storing: %s uniqueId: %s - %s', dumpPath, uniqueClientId, err);
        } finally {
            await asyncDeleteFile(dumpPath);
        }
    }
}

module.exports = DumpPersister;
