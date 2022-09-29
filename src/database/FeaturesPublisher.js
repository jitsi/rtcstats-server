/* eslint-disable no-invalid-this */
const assert = require('assert').strict;
const uuid = require('uuid');

const { getSQLTimestamp } = require('../utils/utils');

/**
 * Service that sends data to AWS Firehose.
 * Firehose will send data to s3 and then issue a COPY command to redshift.
 */
class FeaturesPublisher {
    /**
     *
     * @param {*} param0
     */
    constructor(dbConnector, appEnv) {
        assert(dbConnector);
        assert(appEnv);

        this._dbConnector = dbConnector;
        this._appEnv = appEnv;

        this._dbConnector.connect();
    }

    /**
     *
     * @param {*} track
     * @param {*} param1
     */
    _publishTrackFeatures(track, { direction, statsSessionId, isP2P, pcId, createDate }) {
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
     *
     * @param {*} pcRecord
     * @param {*} statsSessionId
     * @param {*} createDate
     */
    _publishAllTrackFeatures(pcRecord, pcId, statsSessionId, createDate) {
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
                isP2P,
                pcId,
                createDate });
        });

        senderTracks.forEach(strack => {
            this._publishTrackFeatures(strack, { direction: 'send',
                statsSessionId,
                isP2P,
                pcId,
                createDate });
        });
    }

    /**
     *
     * @param {*} features
     * @param {*} statsSessionId
     * @param {*} createDate
     */
    _publishPCFeatures(features, statsSessionId, createDate) {
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
            this._publishAllTrackFeatures(pcRecords[pc]);
        });
    }

    /**
     *
     * @param {*} features
     * @param {*} statsSessionId
     */
    _putFaceLandmarks(features, statsSessionId) {
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
     *
     * @param {*} dumpInfo
     * @param {*} features
     * @param {*} createDate
     */
    _publishMeetingFeatures(dumpInfo, features, createDate) {
        const {
            clientId: statsSessionId,
            userId: displayName,
            conferenceId: meetingName,
            conferenceUrl: meetingUrl,
            sessionId: meetingUniqueId,
            endpointId,
            isBreakoutRoom,
            breakoutRoomId,
            parentStatsSessionId
        } = dumpInfo;

        const {
            browserInfo: {
                name: browserName,
                version: browserVersion,
                os
            },
            deploymentInfo: {
                crossRegion,
                environment,
                region,
                releaseNumber,
                shard,
                userRegion
            },
            metrics: {
                sessionDurationMs,
                conferenceDurationMs
            },
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
            }
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
            parentStatsSessionId
        };

        this._dbConnector.putMeetingFeaturesRecord(meetingFeaturesRecord);
    }

    /**
     *
     * @param {*} param0
     */
    publish({ dumpInfo, features }) {
        const { clientId: statsSessionId } = dumpInfo;
        const createDate = getSQLTimestamp();

        this._publishMeetingFeatures(dumpInfo, features, createDate);
        this._publishPCFeatures(features, statsSessionId, createDate);
        this._publishFaceLandmarks(features, statsSessionId);
    }
}

module.exports = FeaturesPublisher;
