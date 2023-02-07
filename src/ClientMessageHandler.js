
const logger = require('./logging');
const storeFile = require('./store/file');
const utils = require('./utils/utils');

const messageTypes = {
    SequenceNumber: 'sn'
};

/**
 * This handles sending the messages to the frontend
 */
class ClientMessageHandler {
    /**
     * @param tempPath {string}
     * @param sequenceNumberSendingInterval {number}
     */
    constructor({ statsSessionId, tempPath, sequenceNumberSendingInterval, demuxSink, client }) {
        logger.debug('[ClientMessageHandler] Constructor statsSessionId', statsSessionId);
        this.statsSessionId = statsSessionId;
        this.tempPath = tempPath;
        this.sequenceNumberSendingInterval = sequenceNumberSendingInterval;
        this.demuxSink = demuxSink;
        this.client = client;
        this.sendLastSequenceNumber = this.sendLastSequenceNumber.bind(this);
    }

    /**
     *  Sends the last sequence number from demuxSink or reads from the dump file
    */
    async sendLastSequenceNumber(isInitial) {
        logger.debug('[ClientMessageHandler] Sending last sequence number for: ', this.statsSessionId);
        let sequenceNumber = 0;

        if (this.demuxSink.lastSequenceNumber > 0) {
            logger.debug('[ClientMessageHandler] Last sequence number from demux ');
            sequenceNumber = this.demuxSink.lastSequenceNumber;
        } else {
            logger.debug('[ClientMessageHandler] Last sequence number from dump ');
            sequenceNumber = await this._getLastSequenceNumberFromDump();
        }

        this.client.send(this._createMessage(
                    messageTypes.SequenceNumber,
                    this._createSequenceNumberBody(sequenceNumber, isInitial)
        ));

        if (this.client.readyState === 1) {
            setTimeout(
                this.sendLastSequenceNumber,
                this.sequenceNumberSendingInterval,
                this.client, this.statsSessionId
            );
        }
        logger.debug('[ClientMessageHandler] Last sequence number: ', sequenceNumber);
    }

    /**
     * Reads the last sequnce number from the dump file.
     */
    async _getLastSequenceNumberFromDump() {
        const dumpPath = utils.getDumpPath(this.tempPath, this.statsSessionId);

        logger.debug('[ClientMessageHandler] Last sequence number from dump: ', dumpPath);

        const promis = storeFile.getLastLine(dumpPath, 1)
            .then(
                lastLine => utils.parseLineForSequenceNumber(lastLine))
            .catch(() => {
                logger.debug('[ClientMessageHandler] New connection. File doesn\'t exist. file: ', dumpPath);

                return 0;
            });

        const result = await promis;

        return result;
    }

    /**
     *
     * @param type {string}
     * @param body {string}
     * @returns {string}
     */
    _createMessage(type, body) {
        return JSON.stringify({
            'type': type,
            'body': body
        });
    }

    /**
     *
     * @param {*} sequenceNumber
     * @param {*} isInitial
     * @returns {object}
     */
    _createSequenceNumberBody(sequenceNumber, isInitial) {
        const body = {
            value: sequenceNumber
        };

        if (isInitial === true) {
            body.state = 'initial';
        }

        return body;
    }
}

module.exports = ClientMessageHandler;
