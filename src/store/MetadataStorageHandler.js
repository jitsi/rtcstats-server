const logger = require('../logging');

/**
 * Handles the storage of metadata entries.
 */
class MetadataStorageHandler {
    /**
     * Constructs a new MetadataStorageHandler instance.
     * @param {DynamoDataSender} dataSender - The storage interface to use for saving entries.
     */
    constructor(dataSender) {
        this.dataSender = dataSender;
    }

    /**
     * Generates the dump ID for an entry based on the client ID.
     * @param {Object} param - The parameter object.
     * @param {string} param.clientId - The client ID.
     * @returns {string} The dump ID.
     */
    getDumpId(clientId) {
        return `${clientId}.gz`;
    }

    /**
     * Saves an entry while ensuring its uniqueness.
     * @param {Object} meta - The data to be saved.
     * @returns {string} The client ID of the saved entry.
     */
    async saveEntryAssureUnique(meta, features) {
        const {
            clientId,
            conferenceId,
            userId,
            conferenceUrl,
            app,
            sessionId // sessionId naming here might be confusing, this actually refers to the meeting unique id
        } = meta;

        const {
            sessionStartTime: startDate,
            sessionEndTime: endDate
        } = features;

        const [ baseDumpId, order ] = clientId.split('_');
        const entry = {
            dumpId: this.getDumpId(clientId),
            conferenceId: conferenceId?.toLowerCase() ?? 'undefined',
            conferenceUrl: conferenceUrl?.toLowerCase() ?? 'undefined',
            userId: userId ?? 'undefined',
            sessionId: sessionId ?? 'undefined',
            app: app ?? 'undefined',
            baseDumpId,
            startDate,
            endDate
        };

        let saveSuccessful = false;
        let clientIdIncrement = Number(order) || 0;

        while (!saveSuccessful) {
            saveSuccessful = await this.dataSender.saveEntry(entry);

            if (!saveSuccessful) {
                logger.warn('[Dynamo] duplicate cliendId %s, incrementing reconnect count', entry.dumpId);
                entry.dumpId = this.getDumpId(`${baseDumpId}_${++clientIdIncrement}`);
            }
        }

        return entry.dumpId;
    }
}

module.exports = MetadataStorageHandler;
