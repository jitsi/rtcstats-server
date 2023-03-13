/* eslint-disable no-invalid-this */
const assert = require('assert').strict;
const uuid = require('uuid');

const logger = require('../logging');
const { getSQLTimestamp } = require('../utils/utils');

/**
 * Service that publishes extracted features to a provided data storage, currently the
 * only implemented option is {@code FirehoseConnector}
 */
class FeaturesPublisher {
    /**
     *
     * @param {Object} dbConnector - Preferred database connector.
     * @param {String} appEnv - Which environment is rtcstats-server currently running on (stage/prod)
     */
    constructor(dbConnector, appEnv) {
        assert(dbConnector);
        assert(appEnv);

        this._dbConnector = dbConnector;
        this._appEnv = appEnv;

        this._dbConnector.connect();
    }

    /**
     * Extracts common dump fields from the given dump info object.
     *
     * @param {Object} dumpInfo - The dump info object to extract fields from.
     * @returns {Object}  An object containing the extracted fields under a common name.
     */
    _extractCommonDumpFields(dumpInfo) {
        const {
            clientId: statsSessionId,
            sessionId: meetingUniqueId
        } = dumpInfo;

        return {
            statsSessionId,
            meetingUniqueId
        };
    }

    /**
     * Publish features related to a specific peer connection track.
     *
     * @param {Object} track - extracted track features.
     * @param {Object} param1 - additional track related metadata.
     */
    _publishTrackFeatures(track, { direction, statsSessionId, meetingUniqueId, isP2P, pcId, createDate }) {
        const {
            mediaType,
            ssrc,
            packets,
            packetsLost,
            packetsLostPct,
            packetsLostVariance,
            startTime,
            endTime,
            concealedPercentage
        } = track;

        const id = uuid.v4();

        const trackFeaturesRecord = {
            id,
            createDate,
            pcId,
            statsSessionId,
            meetingUniqueId,
            isP2P,
            direction,
            mediaType,
            ssrc,
            packets,
            packetsLost,
            packetsLostPct,
            packetsLostVariance,
            concealedPercentage
        };

        if (startTime) {
            trackFeaturesRecord.startTime = getSQLTimestamp(startTime);
        }

        if (endTime) {
            trackFeaturesRecord.endTime = getSQLTimestamp(endTime);
        }

        this._dbConnector.putTrackFeaturesRecord(trackFeaturesRecord);
    }

    /**
     * Publish all peer connection track features.
     * @param {Object} dumpInfo - Session metadata.
     * @param {Object} pcRecord - Features associated with this specific peer connection.
     * @param {Number} pcId - Unique pc entry identifier.
     * @param {String} statsSessionId - rtcstats-server session id
     * @param {String} createDate - SQL formatted timestamp string.
     */
    _publishAllTrackFeatures(dumpInfo, pcRecord, pcId, createDate) {
        const {
            statsSessionId,
            meetingUniqueId
        } = this._extractCommonDumpFields(dumpInfo);

        const {
            isP2P,
            tracks: {
                receiverTracks = [],
                senderTracks = []
            }
        } = pcRecord;

        receiverTracks.forEach(rtrack => {
            this._publishTrackFeatures(rtrack, { direction: 'received',
                statsSessionId,
                meetingUniqueId,
                isP2P,
                pcId,
                createDate });
        });

        senderTracks.forEach(strack => {
            this._publishTrackFeatures(strack, { direction: 'send',
                statsSessionId,
                meetingUniqueId,
                isP2P,
                pcId,
                createDate });
        });
    }

    /**
     * Publish all peer connection features..
     *
     * @param {Object} dumpInfo - Session metadata.
     * @param {Object} features - All the current session features.
     * @param {String} createDate - SQL formatted timestamp string.
     */
    _publishPCFeatures(dumpInfo, features, createDate) {
        const {
            statsSessionId,
            meetingUniqueId
        } = this._extractCommonDumpFields(dumpInfo);

        const {
            aggregates: pcRecords = { }
        } = features;

        Object.keys(pcRecords).forEach(pc => {
            const {
                dtlsErrors,
                dtlsFailure,
                sdpCreateFailure,
                sdpSetFailure,
                isP2P,
                usesRelay,
                isCallstats,
                iceReconnects,
                pcSessionDurationMs,
                connectionFailed,
                lastIceFailure,
                lastIceDisconnect,
                trackAggregates: {
                    receivedPacketsLostPct,
                    sentPacketsLostPct,
                    totalPacketsReceived,
                    totalPacketsSent,
                    totalReceivedPacketsLost,
                    totalSentPacketsLost
                },
                transportAggregates: { meanRtt },
                inboundVideoExperience: {
                    upperBoundAggregates = { },
                    lowerBoundAggregates = { }
                } = { }
            } = pcRecords[pc];

            /* for now we don't care about recording stats for Callstats PeerConnections */
            if (isCallstats) {
                return;
            }

            const id = uuid.v4();
            const pcFeaturesRecord = {
                pcname: pc,
                id,
                createDate,
                statsSessionId,
                meetingUniqueId,
                dtlsErrors,
                dtlsFailure,
                sdpCreateFailure,
                sdpSetFailure,
                isP2P,
                usesRelay,
                iceReconnects,
                pcSessionDurationMs,
                connectionFailed,
                lastIceFailure,
                lastIceDisconnect,
                receivedPacketsLostPct,
                sentPacketsLostPct,
                totalPacketsReceived,
                totalPacketsSent,
                totalReceivedPacketsLost,
                totalSentPacketsLost,
                meanRtt,
                meanUpperBoundFrameHeight: upperBoundAggregates.meanFrameHeight,
                meanUpperBoundFramesPerSecond: upperBoundAggregates.meanFramesPerSecond,
                meanLowerBoundFrameHeight: lowerBoundAggregates.meanFrameHeight,
                meanLowerBoundFramesPerSecond: lowerBoundAggregates.meanFramesPerSecond
            };

            this._dbConnector.putPCFeaturesRecord(pcFeaturesRecord);
            this._publishAllTrackFeatures(dumpInfo, pcRecords[pc], id, createDate);
        });
    }

    /**
     * The rtcstats-server sends all detected face landmarks along with the timestamp,
     * these are then published as a time series.
     *
     * @param {Object} features - All the current session features.
     * @param {String} statsSessionId - rtcstats-server session id
     */
    _publishFaceLandmarks(features, statsSessionId) {
        const { faceLandmarksTimestamps } = features;

        const faceLandmarkRecords = faceLandmarksTimestamps.map(({ timestamp, faceLandmarks }) => {
            return {
                id: uuid.v4(),
                statsSessionId,
                timestamp,
                faceLandmarks
            };
        });

        this._dbConnector.putFaceLandmarkRecords(faceLandmarkRecords);
    }

    /**
     * Send dominant speaker events, these track when the user associated with the current session
     * started or stopped being the dominant speaker.
     *
     * @param {Object} features - All the current session features.
     * @param {String} statsSessionId - rtcstats-server session id
     */
    _publishDominantSpeakerEvents(features, statsSessionId) {
        const { dominantSpeakerEvents } = features;

        const dominantSpeakerEventRecords = dominantSpeakerEvents.map(({ type, timestamp }) => {
            return {
                id: uuid.v4(),
                statsSessionId,
                timestamp,
                type
            };
        });

        this._dbConnector.putMeetingEventRecords(dominantSpeakerEventRecords);
    }

    /**
     * Publish jitsi meeting specific features.
     *
     * @param {Object} dumpInfo - Session metadata.
     * @param {Object} features - All the current session features.
     * @param {String} createDate - SQL formatted timestamp string.
     */
    _publishMeetingFeatures(dumpInfo, features, createDate) {
        const {
            statsSessionId,
            meetingUniqueId
        } = this._extractCommonDumpFields(dumpInfo);

        const {
            userId: displayName,
            conferenceId: meetingName,
            conferenceUrl: meetingUrl,
            endpointId,
            isBreakoutRoom,
            breakoutRoomId,
            parentStatsSessionId,
            tenant,
            jaasClientId
        } = dumpInfo;

        const {
            browserInfo: {
                name: browserName,
                version: browserVersion,
                os
            } = {},
            deploymentInfo: {
                crossRegion,
                environment,
                region,
                releaseNumber,
                shard,
                userRegion
            } = {},
            metrics: {
                sessionDurationMs,
                conferenceDurationMs
            } = {},
            conferenceStartTime: conferenceStartTimestamp,
            sessionStartTime: sessionStartTimestamp,
            sessionEndTime: sessionEndTimestamp,
            dominantSpeakerChanges,
            speakerTime,
            sentiment: {
                angry: sentimentAngry,
                disgusted: sentimentDisgusted,
                fearful: sentimentFearful,
                happy: sentimentHappy,
                neutral: sentimentNeutral,
                sad: sentimentSad,
                surprised: sentimentSurprised
            } = {}
        } = features;

        const conferenceStartTime = conferenceStartTimestamp ? getSQLTimestamp(conferenceStartTimestamp) : null;
        const sessionStartTime = sessionStartTimestamp ? getSQLTimestamp(sessionStartTimestamp) : null;
        const sessionEndTime = sessionEndTimestamp ? getSQLTimestamp(sessionEndTimestamp) : null;

        // The schemaObj needs to match the redshift table schema.
        const meetingFeaturesRecord = {
            appEnv: this._appEnv,
            createDate,
            statsSessionId,
            displayName,
            crossRegion,
            environment,
            region,
            releaseNumber,
            shard,
            userRegion,
            meetingName,
            meetingUrl,
            meetingUniqueId,
            endpointId,
            conferenceStartTime,
            sessionStartTime,
            sessionEndTime,
            sessionDurationMs,
            conferenceDurationMs,
            dominantSpeakerChanges,
            speakerTime,
            sentimentAngry,
            sentimentDisgusted,
            sentimentFearful,
            sentimentHappy,
            sentimentNeutral,
            sentimentSad,
            sentimentSurprised,
            os,
            browserName,
            browserVersion,
            isBreakoutRoom,
            breakoutRoomId,
            parentStatsSessionId,
            tenant,
            jaasClientId
        };

        this._dbConnector.putMeetingFeaturesRecord(meetingFeaturesRecord);
    }

    /**
     * Publish extracted features.
     *
     * @param {Object} param0 - Object containing session metadata and extracted features.
     */
    publish({ dumpInfo, features }) {
        const { clientId: statsSessionId } = dumpInfo;
        const createDate = getSQLTimestamp();

        logger.info(`[FeaturesPublisher] Publishing data for ${statsSessionId}`);

        this._publishMeetingFeatures(dumpInfo, features, createDate);
        this._publishPCFeatures(dumpInfo, features, createDate);
        this._publishFaceLandmarks(features, statsSessionId);
        this._publishDominantSpeakerEvents(features, statsSessionId);
    }
}

module.exports = FeaturesPublisher;
