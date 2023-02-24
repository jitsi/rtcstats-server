const fs = require('fs');
const sizeof = require('object-sizeof');
const { Writable } = require('stream');
const util = require('util');

const PromCollector = require('./metrics/PromCollector.js');
const utils = require('./utils/utils');
const { uuidV4 } = require('./utils/utils.js');

// we are using this because we want the regular file descriptors returned,
// not the FileHandle objects from fs.promises.open
const fsOpen = util.promisify(fs.open);


/**
 *
 */
class RequestData {
    /**
     *
     * @param {*} param0
     */
    constructor({ timestamp, sequenceNumber }) {
        this.timestamp = timestamp;
        this.sequenceNumber = sequenceNumber;
    }
}

/**
 * Stream designed to handle API requests and write them to a sink (file WritableStream at this point)
 */
class DemuxSink extends Writable {
    /**
     *
     * C'tor
     *
     * @param {string} dumpFolder - Path to where sink files will be temporarily stored.
     * @param {Object} connectionInfo - Object containing information about the ws connection which stream the data.
     * @param {Object} log - Log object.
     * @param {boolean} persistDump - Flag used for generating a complete dump of the data coming to the stream.
     * Required when creating mock tests.
     */
    constructor({ tempPath, dumpFolder, dumpPath, connectionInfo, log, persistDump = false }) {
        super({ objectMode: true });

        this.dumpFolder = dumpFolder;
        this.dumpPath = dumpPath;
        this.connectionInfo = connectionInfo;
        this.log = log;
        this.timeoutId = -1;
        this.sinkMap = new Map();
        this.persistDump = persistDump;
        this.lastSequenceNumber = 0;
        this.lastTimestamp = -1;
        this.tempPath = tempPath;

        // TODO move this as a separate readable/writable stream so we don't pollute this class.
        if (this.persistDump) {
            this.persistDumpPath = `${dumpFolder}/stream-${uuidV4()}`;
            this.streamDumpFile = fs.createWriteStream(this.persistDumpPath);
        }
    }

    /**
     * Close all the opened sinks and stop the timeout, this should be called once
     * the stream has ended.
     *
     */
    _clearState() {
        this.log.debug('[Demux] Clearing demux state');

        clearTimeout(this.timeoutId);

        for (const sinkData of this.sinkMap.values()) {
            this._sinkClose(sinkData);
        }
    }

    /**
     * Stream level timeout, this will trigger if nothing gets written to stream for a predefined amount of time.
     */
    _timeout() {
        this.log.debug('[Demux] Timeout reached');

        // The stream will eventually call _destroy which will properly handle the cleanup.
        this.end();
    }

    /**
     * Implementation of the stream api, will be called when stream closes regardless if it's because of an error
     * or happy flow. We use this chance to clear the states of the demux.
     *
     * @param {Error} - Error or null if nothing went wrong.
     * @param {Function} - Needs to be called in order to successfully end the state of the stream.
     */
    _destroy(err, cb) {
        this.log.debug('[Demux] Destroy called with err:', err);
        this._clearState();

        // Forward the state in which the stream closed, required by the stream api.
        cb(err);
    }

    /**
     * Implementation of the stream API. Receive inbound objects and direct them to the API implemented
     * in _handSinkEvent.
     *
     * @param {Object} obj - Object and not buffer because of object mode.
     * @param {string} encoding - Would be the string encoding, ignore because we're in object mode.
     * @param {Function} cb - Needs to be called as dictated by the stream api.
     */
    _write(obj, encoding, cb) {
        if (this.persistDump) {
            this.streamDumpFile.write(`${JSON.stringify(obj)}\n`);
        }

        // We received something so reset the timeout.
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(this._timeout.bind(this), 60000);
        this._handleRequest(obj)
            .then(cb)
            .catch(cb);
    }

    /**
     *  Close the target sink.
     *
     * @param {string} id - UniqueId associated with the sink
     * @param {WriteStream} sink - Opened file writable stream associated with the id
     */
    _sinkClose({ id, sink }) {
        this.log.info('[Demux] close-sink %s', id);

        sink.end();
    }

    /**
     * Once the sink has notified us that it finished writing we can notify the clients that they can now, process
     * the generated file.
     *
     * @param {string} id - sink id as saved in the sinkMap
     */
    _handleSinkClose(id) {
        const sinkData = this.sinkMap.get(id);

        // Sanity check, make sure the data is available if not log an error and just send the id such that any
        // listening client has s chance to handle the sink.
        if (sinkData) {
            // we need to emit this on file stream finish
            this.emit('close-sink', {
                id: sinkData.id
            });
        } else {
            this.log.error('[Demux] sink on close meta should be available id:', id);

            this.emit('close-sink', { id });
        }
        this.sinkMap.delete(id);
    }

    /**
     * Open a writable file stream and associate it with the provided unique id.
     *
     * @param {string} id - unique id.
     * @returns {Object} - Associated metadata object that will be saved in the local map.
     */
    async _sinkCreate(id) {
        PromCollector.sessionCount.inc();

        const resolvedId = id;
        const isReconnect = fs.existsSync(this.dumpPath);
        const fd = await fsOpen(this.dumpPath, 'a');

        this.log.info('[Demux] open-sink id: %s; path %s; connection: %o', id, this.dumpPath, this.connectionInfo);

        const sink = fs.createWriteStream(this.dumpPath, { fd });

        // Add the associated data to a map in order to properly direct requests to the appropriate sink.
        const sinkData = {
            id: resolvedId,
            sink,
            meta: {
                startDate: this.startDate,
                dumpPath: this.dumpPath
            }
        };

        this.sinkMap.set(id, sinkData);

        sink.on('error', error => this.log.error('[Demux] sink on error id: ', id, ' error:', error));

        // The close event should be emitted both on error and happy flow.
        sink.on('close', this._handleSinkClose.bind(this, id));

        if (!isReconnect) {
            // Initialize the dump file by adding the connection metadata at the beginning. This data is usually used
            // by visualizer tools for identifying the originating client (browser, jvb or other).
            this._sinkWrite(
            sink,
            JSON.stringify([ 'connectionInfo',
                null, JSON.stringify(this.connectionInfo), Date.now() ]));
        }

        return sinkData;
    }

    /**
     * Update metadata in the local map and write it to the sink.
     *
     * @param {Object} sinkData - Current sink metadata
     * @param {Object} data - New metadata.
     */
    async _sinkUpdateMetadata(sinkData, data) {
        // We expect metadata to be objects thus we need to stringify them before writing to the sink.
        this._sinkWrite(sinkData.sink, JSON.stringify(data));
    }

    /**
     * Self explanatory.
     *
     * @param {WritableStream} sink - Target sink.
     * @param {string} data - Data to write as a string.
     */
    _sinkWrite(sink, data) {
        // TODO Add support for objects as well, in case we receive an object just serialize it.
        if (data) {
            sink.write(`${data}\n`);
        }
    }

    /**
     * Precondition that checks that a requests has the expected fields.
     *
     * @param {string} clientId
     * @param {string} type
     */
    _requestPrecondition({ statsSessionId, type }) {

        if (!statsSessionId) {
            throw new Error('[Demux] statsSessionId missing from request!');
        }

        if (!type) {
            throw new Error('[Demux] type missing from request!');
        }
    }

    /**
     * Validates first if a previously connected sessionId's data has been processed
     * and checks if there is no missing sequence number
     *
     * @param {*} statsSessionId
     * @param {*} sequenceNumber
     * @param {*} lastSequenceNumber
     */
    _validateSequenceNumber(statsSessionId, sequenceNumber, lastSequenceNumber) {
        if ((sequenceNumber - lastSequenceNumber > 1)
        && !fs.existsSync(utils.getDumpPath(this.tempPath, statsSessionId))) {
            PromCollector.dataIsAlreadyProcessedCount.inc();
            throw new Error(`[Demux] Session reconnected but file was already processed! sessionId: ${statsSessionId}`);
        }

        if (sequenceNumber - this.lastSequenceNumber > 1) {
            this.log.error(`[Demux] sequence number is missing! 
                sessionId: ${statsSessionId} 
                sequenceNumber: ${sequenceNumber} 
                lastSequenceNumber: ${this.lastSequenceNumber}`
            );
            PromCollector.missingSequenceNumberCount.inc();
        }
    }

    /**
     *
     * @param {*} data
     * @returns {RequestData}
     */
    _toRequestData(data) {
        const jsonData = Array.isArray(data) ? data : JSON.parse(data);
        const sequenceNumber = jsonData[4];
        const timestamp = jsonData[3];

        return new RequestData({ timestamp,
            sequenceNumber });
    }

    /**
     * Handle API requests.
     *
     * @param {Object} request - Request object
     */
    async _handleRequest(request) {
        this._requestPrecondition(request);
        PromCollector.requestSizeBytes.observe(sizeof(request));

        const { statsSessionId, type, data } = request;

        // save the last sequence number to notify the frontend
        if (data) {
            const requestData = this._toRequestData(data);

            this._validateSequenceNumber(statsSessionId, requestData.sequenceNumber, this.lastSequenceNumber);

            this.lastTimestamp = requestData.timestamp;
            this.lastSequenceNumber = requestData.sequenceNumber;
        }


        // If this is the first request coming from this client id ,create a new sink (file write stream in this case)
        // and it's associated metadata.
        // In case of reconnects the incremental sink naming convention described in _sinkCreate
        // will take care of it.
        const sinkData = this.sinkMap.get(statsSessionId) || await this._sinkCreate(statsSessionId);

        if (!sinkData) {
            this.log.warn('[Demux] Received data for already closed sink: ', statsSessionId);

            return;
        }

        switch (type) {

        // Close will be sent by a client when operations on a statsSessionId have been completed.
        // Subsequent operations will be taken by services in the upper level, like upload to store and persist
        // metadata do a db.
        case 'close':
            this.log.info('[Demux] sink closed');

            return this._sinkClose(sinkData);

        // Identity requests will update the local metadata and also write it to the sink.
        // Metadata associated with a sink will be propagated through an event to listeners when the sink closes,
        // either on an explicit close or when the timeout mechanism triggers.
        case 'identity':
            return this._sinkUpdateMetadata(sinkData, data);

        // Generic request with stats data, simply write it to the sink.
        case 'stats-entry':
            return this._sinkWrite(sinkData.sink, data);

        // Request sent by clients in order to keep the timeout from triggering.
        case 'keepalive':
            this.log.debug('[Demux] Keepalive received for :', statsSessionId);

            return;

        default:
            this.log.warn('[Demux] Invalid API Request: ', request);

            return;
        }
    }
}

module.exports = DemuxSink;
