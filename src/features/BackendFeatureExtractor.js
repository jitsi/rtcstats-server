/**
 * Extract features for backend services such as JICOFO, JVB, and JIGASI.
 */
class BackendFeatureExtractor {
    /**
     * Create a new BackendFeatureExtractor.
     * @param {Object} dumpInfo - The dump information.
     * @param {string} dumpInfo.dumpPath - The path to the dump file.
     * @param {string} dumpInfo.clientId - The ID of the client.
     * @param {ConnectionInformation} dumpInfo.connectionInfo - The connection information.
     */
    constructor(dumpInfo) {
        const {
            dumpPath,
            clientId,
            connectionInfo
        } = dumpInfo;

        this.dumpPath = dumpPath;
        this.clientId = clientId;
        this.connectionInfo = connectionInfo;

        this.identity = {};
        this.features = {
            sessionStartTime: null,
            sessionEndTime: null
        };
        this.extractFunctions = {
            identity: this._handleIdentity,
            other: this._handleOtherEntry
        };
    }

    /**
     * Record the session time.
     * @param {Object} dumpLineObj - The dump entry to process.
     * @returns {void}
     */
    _recordSessionTime = dumpLineObj => {
        const { timestamp = 0 } = dumpLineObj;

        if (!this.features.sessionStartTime && timestamp) {
            this.features.sessionStartTime = timestamp;
        }

        if (timestamp > this.features.sessionEndTime) {
            this.features.sessionEndTime = timestamp;
        }
    };

    /**
     * Handle an identity entry.
     * @param {Object} dumpLineObj - The dump entry to process.
     */
    _handleIdentity = dumpLineObj => {
        const { data } = dumpLineObj;

        this.identity = {
            ...this.identity,
            ...data
        };
    };

    /**
     * Does nothing for now.
     */
    _handleOtherEntry = () => {
        // Does nothing for now.
    };

    /**
     * Process a dump entry.
     * @param {Object} dumpLineObj - The dump entry to process.
     * @param {number} requestSize - The size of the request.
     * @returns {Promise} - A promise that resolves when the entry is processed.
     */
    handleDumpEntry(dumpLineObj, lineSize) {
        const { type } = dumpLineObj;

        this._recordSessionTime(dumpLineObj);

        if (this.extractFunctions[type]) {
            this.extractFunctions[type](dumpLineObj, lineSize);
        } else {
            this.extractFunctions.other(dumpLineObj, lineSize);
        }
    }

    /**
     * Extract the identity data.
     * @returns {Object} - The extracted identity data.
     */
    _extractDumpMetadata() {
        const { clientType, statsFormat } = this.connectionInfo.getDetails();

        const {
            applicationName: app = 'Undefined',
            confID: conferenceUrl,
            confName: conferenceId,
            displayName: userId,
            meetingUniqueId: sessionId
        } = this.identity;

        // Metadata associated with a dump can get large so just select the necessary fields.
        const dumpMetadata = {
            app,
            clientId: this.clientId,
            clientType,
            conferenceId,
            conferenceUrl,
            dumpPath: this.dumpPath,
            sessionId,
            userId,
            statsFormat
        };

        return dumpMetadata;
    }

    /**
     * Extract the features.
     * @returns {Object} - The extracted features.
     */
    _extractFeatures() {
        // We give default values to sessionStartTime and sessionEndTime as we need some sort of
        // temporal values for a entry if they are missing, in lieu of actual values, the date of
        // processing should be fairly close to actual values.
        !this.features.sessionStartTime && (this.features.sessionStartTime = Date.now());
        !this.features.sessionEndTime && (this.features.sessionEndTime = Date.now());

        return this.features;
    }

    /**
     * TODO: Document.
     */
    extract() {
        return {
            dumpMetadata: this._extractDumpMetadata(),
            features: this._extractFeatures()
        };
    }
}

module.exports = BackendFeatureExtractor;
