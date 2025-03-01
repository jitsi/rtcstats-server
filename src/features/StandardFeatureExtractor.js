/* eslint-disable no-invalid-this */

const assert = require('assert').strict;

const logger = require('../logging');
const statsDecompressor = require('../utils/getstats-deltacompression').decompress;
const { getStatsFormat, getBrowserDetails } = require('../utils/stats-detection');
const { extractTenantDataFromUrl } = require('../utils/utils');

const QualityStatsCollector = require('./quality-stats/QualityStatsCollector');
const StatsAggregator = require('./quality-stats/StatsAggregator');


/**
 * Feature extractor for rtcstats clients (browsers, electron clients, react native)
 */
class StandardFeatureExtractor {

    /**
     *
     * @param {*} statsDumpInfo
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

        const { statsFormat } = connectionInfo.getDetails();

        if (statsFormat) {
            this.statsFormat = statsFormat;
            this.collector = new QualityStatsCollector(statsFormat);
        }

        this.aggregator = new StatsAggregator();

        this.baseStats = {};

        this.dominantSpeakerData = {
            dominantSpeakerStartTimeStamp: undefined,
            currentDominantSpeaker: undefined,
            speakerStats: {}
        };

        this.features = {
            conferenceStartTime: 0,
            sessionStartTime: 0,
            sessionEndTime: 0,
            dominantSpeakerChanges: 0,
            speakerTime: 0,
            identity: {},
            sentiment: {
                angry: 0,
                disgusted: 0,
                fearful: 0,
                happy: 0,
                neutral: 0,
                sad: 0,
                surprised: 0
            },
            faceLandmarksTimestamps: [],
            dominantSpeakerEvents: [],
            metrics: {
                statsRequestBytes: 0,
                statsRequestCount: 0,
                otherRequestBytes: 0,
                otherRequestCount: 0,
                sdpRequestBytes: 0,
                sdpRequestCount: 0,
                dsRequestBytes: 0,
                dsRequestCount: 0,
                totalProcessedBytes: 0,
                totalProcessedCount: 0,
                sentimentRequestBytes: 0,
                sentimentRequestCount: 0
            }
        };

        this.extractFunctions = {
            identity: this._handleIdentity,
            conferenceStartTimestamp: this._handleConfStartTime,
            connectionInfo: this._handleConnectionInfo,
            constraints: this._handleConstraints,
            create: this._handleCreate,
            createAnswerOnSuccess: this._handleSDPRequest,
            createAnswerOnFailure: this._handleSDPFailure,
            createOfferOnSuccess: this._handleSDPRequest,
            createOfferOnFailure: this._handleSDPFailure,
            dominantSpeaker: this._handleDominantSpeaker,
            e2eRtt: this._handleE2eRtt,
            faceLandmarks: this._handleFaceLandmarks,
            getstats: this._handleStatsRequest,
            onconnectionstatechange: this._handleConnectionStateChange,
            oniceconnectionstatechange: this._handleIceConnectionStateChange,
            other: this._handleOtherRequest,
            ondtlserror: this._handleDtlsError,
            ondtlsstatechange: this._handleDtlsStateChange,
            setLocalDescription: this._handleSDPRequest,
            setLocalDescriptionOnFailure: this._handleSDPFailure,
            setRemoteDescription: this._handleSDPRequest,
            setRemoteDescriptionOnFailure: this._handleSDPFailure,
            setVideoType: this._handleVideoType
        };

        // try {
        //     fs.unlinkSync('decompress.txt');
        // } catch (e) {
        //     //
        // }

        // this.decompressFile = fs.createWriteStream('decompress.txt', {
        //     flags: 'a' // 'a' means appending (old data will be preserved)
        // });
    }

    _handleVideoType = dumpLineObj => {
        const [ , , videoTypeData, timestamp ] = dumpLineObj;

        this.collector.processVideoTypeEntry(videoTypeData, timestamp);
    };

    _handleCreate = dumpLineObj => {
        const [ , pc, pcConstraints ] = dumpLineObj;

        this.collector.processPcConstraintsEntry(pc, pcConstraints);
    };

    _handleConstraints = dumpLineObj => {
        const [ , pc, constraintsEntry ] = dumpLineObj;

        this.collector.processConstraintsEntry(pc, constraintsEntry);
    };

    _handleConnectionInfo = dumpLineObj => {
        const [ requestType, , connectionInfoEntry ] = dumpLineObj;

        assert(requestType === 'connectionInfo', 'Unexpected request type');

        let connectionInfo;

        // TODO - this is added so we can keep backward compatibility with the old format
        // after the initial deploy this can be removed
        if (typeof connectionInfoEntry === 'string') {
            connectionInfo = JSON.parse(connectionInfoEntry);
        } else if (typeof connectionInfoEntry === 'object') {
            connectionInfo = connectionInfoEntry;
        } else {
            throw new Error('connectionInfo must be a string or an object');
        }

        if (!this.statsFormat) {
            this.statsFormat = getStatsFormat(connectionInfo);
            this.collector = new QualityStatsCollector(this.statsFormat);
        }

        const browserDetails = getBrowserDetails(connectionInfo);

        if (browserDetails) {
            this.features.browserInfo = browserDetails;
        }
    };

    _handleIdentity = dumpLineObj => {
        const [ , , identityEntry ] = dumpLineObj;

        this.endpointId = this.endpointId || identityEntry.endpointId;

        this.features.deploymentInfo = {
            ...this.features?.deploymentInfo,
            ...identityEntry?.deploymentInfo
        };

        this.features.identity = {
            ...this.features?.identity,
            ...identityEntry
        };
    };

    /**
     *
     * @param {*} dumpLineObj
     */
    _handleConnectionStateChange = dumpLineObj => {

        this.collector.processConnectionState(dumpLineObj);
    };

    /**
     *
     * @param {*} dumpLineObj
     */
    _handleIceConnectionStateChange = dumpLineObj => {

        this.collector.processIceConnectionState(dumpLineObj);
    };

    _handleFaceLandmarks = (dumpLineObj, requestSize) => {

        const [ , , data ] = dumpLineObj;

        const { sentiment, metrics, faceLandmarksTimestamps } = this.features;

        metrics.sentimentRequestBytes += requestSize;
        metrics.sentimentRequestCount++;

        // {\"duration\":9,\"faceLandmarks\":\"neutral\",\"timestamp\":12415652562}
        // Expected data format for faceLandmarks:
        // {duration: <seconds>, faceLandmarks: <string>, timestamp: <time>}
        // duration is expressed in seconds and, face landmarks can be one of:
        // angry, disgusted, fearful, happy, neutral, sad, surprised
        const { duration, faceLandmarks, timestamp } = data;

        faceLandmarksTimestamps.push({
            timestamp,
            faceLandmarks
        });

        if (faceLandmarks in sentiment) {
            sentiment[faceLandmarks] += duration;
        }
    };

    /**
     *
     * @param {*} data
     * @param {*} timestamp
     */
    _handleDominantSpeaker = (dumpLineObj, requestSize) => {

        const [ , , data, timestamp ] = dumpLineObj;

        assert(timestamp, 'timestamp field missing from dominantSpeaker data');

        const { metrics, dominantSpeakerEvents } = this.features;

        metrics.dsRequestBytes += requestSize;
        metrics.dsRequestCount++;

        // Expected data format for dominant speaker:
        // {"dominantSpeakerEndpoint": "1a404b1b","previousSpeakers": ["bb211808","1a4dqdb",
        //  "1adqwdqw", "312f4b1b"], "endpointId": "1a404b1b"}
        // `dominantSpeakerEndpoint` can also be null, which means that the current dominantSpeaker
        // is no longer speaking.
        const { dominantSpeakerEndpoint: newDominantSpeaker } = data;
        const { speakerStats, currentDominantSpeaker, dominantSpeakerStartTimeStamp } = this.dominantSpeakerData;

        // Check if the current sessions's user is the new dominant speaker, if so mark it with an event.
        if (newDominantSpeaker === this.endpointId) {
            dominantSpeakerEvents.push({ type: 'DOMINANT_SPEAKER_STARTED',
                timestamp });

        // If the previous dominant speaker was the current session's user that means that he is no longer the dominant
        // speaker so we mark that with an event.
        } else if (currentDominantSpeaker === this.endpointId) {
            dominantSpeakerEvents.push({ type: 'DOMINANT_SPEAKER_STOPPED',
                timestamp });
        }

        // Initialize speakerStats for endpoint if not present.
        speakerStats[newDominantSpeaker] ??= { speakerTime: 0,
            dominantSpeakerChanges: 0 };

        const { [newDominantSpeaker]: newDominantSpeakerStats } = speakerStats;

        newDominantSpeakerStats.dominantSpeakerChanges++;

        // Calculate speaker time for the previous dominant speaker
        if (currentDominantSpeaker) {
            const { [currentDominantSpeaker]: currentSpeakerStats } = speakerStats;

            const speakerTime = timestamp - dominantSpeakerStartTimeStamp;

            currentSpeakerStats.speakerTime += speakerTime;
        }

        this.dominantSpeakerData.currentDominantSpeaker = newDominantSpeaker;
        this.dominantSpeakerData.dominantSpeakerStartTimeStamp = timestamp;
    };

    /**
     *
     * @param {*} data
     * @param {*} timestamp
     * @param {*} requestSize
     */
    _handleSDPRequest = (dumpLineObj, requestSize) => {
        const { metrics } = this.features;

        metrics.sdpRequestBytes += requestSize;
        metrics.sdpRequestCount++;
    };

    _handleSDPFailure = dumpLineObj => {
        const [ requestType, pc, errormsg ] = dumpLineObj;

        this.collector.processSdpFailure(requestType, pc, errormsg);
    };

    _handleDtlsError = dumpLineObj => {
        const [ , pc, errormsg ] = dumpLineObj;

        this.collector.processDtlsErrorEntry(pc, errormsg);
    };

    _handleDtlsStateChange = dumpLineObj => {
        const [ , pc, state ] = dumpLineObj;

        const isFirefox = this.statsFormat === 'firefox';

        this.collector.processDtlsStateEntry(pc, state, isFirefox);
    };

    _handleConfStartTime = dumpLineObj => {
        let [ , , timestamp ] = dumpLineObj;

        // Convert timestamp to a number if it's a string
        if (typeof timestamp === 'string') {
            timestamp = Number(timestamp);
        }

        // At the end of a conference jitsi-meet sends another `conferenceStartTime` event
        // with 0 as the start time, so we ignore it.
        if (timestamp === 0) {
            return;
        }

        // For all other invalid values undefined, null, NaN, etc. we use the current time.
        this.features.conferenceStartTime = timestamp || Date.now();
    };

    _handleE2eRtt = dumpLineObj => {
        const [ , , line ] = dumpLineObj;

        const { remoteEndpointId, rtt, remoteRegion } = line;

        if (!('e2epings' in this.features)) {
            this.features.e2epings = {};
        }

        this.features.e2epings[remoteEndpointId] = {
            remoteRegion,
            rtt
        };
    };

    /**
     *
     * @param {*} data
     * @param {*} timestamp
     * @param {*} requestSize
     */
    _handleStatsRequest = (dumpLineObj, requestSize) => {
        const { metrics } = this.features;

        const [ , pc, statsReport, timestamp ] = dumpLineObj;

        // The rtcstats client applies a delta compression for sent stats entries, i.e. it only sends the difference
        // from the prior stat entry, so we need to decompress them.
        if (this.baseStats[pc]) {
            this.baseStats[pc] = statsDecompressor(this.baseStats[pc], statsReport);
        } else {
            this.baseStats[pc] = statsReport;
        }

        // this.decompressFile.write(JSON.stringify([ pc, null, this.baseStats[pc] ]));

        this.collector.processStatsEntry(pc, this.baseStats[pc], timestamp);

        metrics.statsRequestBytes += requestSize;
        metrics.statsRequestCount++;
    };

    /**
     *
     * @param {*} data
     * @param {*} timestamp
     * @param {*} requestSize
     */
    _handleOtherRequest = (dumpLineObj, requestSize) => {
        const { metrics } = this.features;

        metrics.otherRequestBytes += requestSize;
        metrics.otherRequestCount++;
    };

    /**
     *
     * @param {*} dumpLineObj
     */
    _handleGenericEntry(dumpLineObj) {
        this._recordSessionDuration(dumpLineObj);
        this.collector.processGenericEntry(dumpLineObj);
    }

    /**
     *
     */
    extractDominantSpeakerFeatures = () => {
        const { speakerStats, currentDominantSpeaker, dominantSpeakerStartTimeStamp } = this.dominantSpeakerData;
        const { [currentDominantSpeaker]: lastSpeakerStats } = speakerStats;

        // No dominant speaker events were generated during this conference,
        if (!currentDominantSpeaker) {
            return;
        }

        // Calculate how much time the last dominant speaker spent until this participant left the meeting.
        const lastSpeakerTime = this.features.sessionEndTime - dominantSpeakerStartTimeStamp;

        lastSpeakerStats.speakerTime += lastSpeakerTime;

        // Extract dominant speaker features for this participant if any were processed.
        if (speakerStats[this.endpointId]) {
            const { dominantSpeakerChanges, speakerTime } = speakerStats[this.endpointId];

            this.features.dominantSpeakerChanges = dominantSpeakerChanges;
            this.features.speakerTime = speakerTime;
        }
    };

    /**
     *
     * @param {*} dumpLineObj
     */
    _recordSessionDuration(dumpLineObj) {
        const [ requestType, , , timestamp ] = dumpLineObj;

        if (requestType !== 'connectionInfo' && requestType !== 'identity') {
            if (!this.features.sessionStartTime && timestamp) {
                this.features.sessionStartTime = timestamp;
            }

            if (timestamp > this.features.sessionEndTime) {
                this.features.sessionEndTime = timestamp;
            }
        }
    }

    /**
     * Process a dump entry.
     * @param {Object} dumpLineObj - The dump entry to process.
     * @param {number} requestSize - The size of the request.
     * @returns {Promise} - A promise that resolves when the entry is processed.
     */
    handleDumpEntry(dumpLineObj, lineSize) {
        const [ requestType, , , ] = dumpLineObj;

        if (this.extractFunctions[requestType]) {
            this.extractFunctions[requestType](dumpLineObj, lineSize);
        } else {
            this.extractFunctions.other(dumpLineObj, lineSize);
        }

        this._handleGenericEntry(dumpLineObj);
    }

    /**
     * Extract the features from the dump.
     */
    _extractDumpMetadata() {
        const { clientType, statsFormat } = this.connectionInfo.getDetails();

        const {
            applicationName: app = 'Undefined',
            confID: conferenceUrl,
            confName: conferenceId,
            customerId,
            endpointId,
            meetingUniqueId: sessionId,
            displayName: userId,
            isBreakoutRoom,
            roomId: breakoutRoomId,
            parentStatsSessionId,
            sessionId: ampSessionId,
            userId: ampUserId,
            deviceId: ampDeviceId
        } = this.features.identity;

        const tenantInfo = extractTenantDataFromUrl(conferenceUrl);

        // customerId provided directly as metadata overwrites the id extracted from the url.
        // jitsi-meet extracts this id using a dedicated endpoint in certain cases.
        if (customerId) {
            tenantInfo.jaasClientId = customerId;
        }

        // Metadata associated with a dump can get large so just select the necessary fields.
        const dumpMetadata = {
            app,
            clientId: this.clientId,
            clientType,
            conferenceId,
            conferenceUrl,
            dumpPath: this.dumpPath,
            endpointId,
            sessionId,
            userId,
            ampSessionId,
            ampUserId,
            ampDeviceId,
            statsFormat,
            isBreakoutRoom,
            breakoutRoomId,
            parentStatsSessionId,
            ...tenantInfo
        };

        delete this.features.identity;

        return dumpMetadata;
    }

    /**
     *
     */
    _extractFeatures() {
        this.extractDominantSpeakerFeatures();

        const { metrics, sessionStartTime, sessionEndTime, conferenceStartTime } = this.features;
        const { dsRequestBytes, sdpRequestBytes, statsRequestBytes, otherRequestBytes } = metrics;
        const { dsRequestCount, sdpRequestCount, statsRequestCount, otherRequestCount } = metrics;

        metrics.conferenceDurationMs = 0;
        if (conferenceStartTime && (sessionEndTime > conferenceStartTime)) {
            // The client doesn't know when the conference ended, so we can only calculate how long it
            // was from the time the conference started till the client left.
            metrics.conferenceDurationMs = sessionEndTime - conferenceStartTime;
        }

        metrics.sessionDurationMs = 0;
        if (sessionEndTime > sessionStartTime) {
            metrics.sessionDurationMs = sessionEndTime - sessionStartTime;
        }
        metrics.totalProcessedBytes = sdpRequestBytes + dsRequestBytes + statsRequestBytes + otherRequestBytes;
        metrics.totalProcessedCount = sdpRequestCount + dsRequestCount + statsRequestCount + otherRequestCount;

        // metrics.dumpFileSizeBytes = dumpFileSizeBytes;

        // Expected result format.
        // PC_0: {
        //     transport: {
        //         rtts: [],
        //     },
        //     ssrc1: {
        //         mediaType: 'audio',
        //         packetsLost: [],
        //         packetsSent: [],
        //         jitter: []
        //     },
        //     ssrc2: {
        //         mediaType: 'video',
        //         packetsLost: [],
        //         packetsSent: [],
        //         jitter: []
        //     },
        // }
        // PC_1: { ... }
        const processedStats = this.collector.getProcessedStats();

        // logger.info('Collected stats: %o', processedStats);

        // Expected result format.
        // PC_0: {
        //     isP2P: false,
        //     trackAggregates: {
        //       totalPacketsLost: 100,
        //       totalPacketsSent: 10676,
        //       packetsLostPct: 0.94
        //     },
        //     transportAggregates: { meanRtt: 0.19 }
        //  },
        // PC_1: { ... }
        const aggregateResults = this.aggregator.calculateAggregates(processedStats);

        this.features.aggregates = aggregateResults;

        logger.debug('Aggregate results: %o', aggregateResults);

        return this.features;
    }


    /**
     *
     */
    extract() {
        logger.info('[Extract] Extracting features for dump: %s', this.clientId);

        return {
            dumpMetadata: this._extractDumpMetadata(),
            features: this._extractFeatures()
        };
    }
}

module.exports = StandardFeatureExtractor;
