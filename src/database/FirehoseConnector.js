/* eslint-disable no-invalid-this */
const assert = require('assert').strict;
const AWS = require('aws-sdk');

const logger = require('../logging');
const PromCollector = require('../metrics/PromCollector');

/**
 * Service that sends data to AWS Firehose.
 * Firehose will send data to s3 and then issue a COPY command to redshift.
 */
class FirehoseConnector {
    /**
     *
     * @param {*} param0
     */
    constructor({
        region,
        meetingStatsStream,
        pcStatsStream,
        trackStatsStream,
        e2ePingStream,
        faceLandmarksStream
    }) {

        assert(region);
        assert(meetingStatsStream);
        assert(pcStatsStream);
        assert(trackStatsStream);
        assert(e2ePingStream);
        assert(faceLandmarksStream);

        this._meetingStatsStream = meetingStatsStream;
        this._pcStatsStream = pcStatsStream;
        this._trackStatsStream = trackStatsStream;
        this._e2ePingStream = e2ePingStream;
        this._faceLandmarksStream = faceLandmarksStream;
        this._awsRegion = region;
    }

    /**
     *
     * @param {*} schemaObj
     * @param {*} stream
     */
    _putRecord(schemaObj, stream) {
        this._firehose.putRecord(
            {
                DeliveryStreamName: stream /* required */,
                Record: {
                    Data: JSON.stringify(schemaObj)
                }
            },
            err => {
                if (err) {
                    logger.error('[Firehose] Error sending data to firehose: %o', err);
                    PromCollector.firehoseErrorCount.inc();

                    return;
                }
                logger.info('[Firehose] Sent data: %o', schemaObj);
            }
        );
    }

    /**
     *
     * @param {*} schemaObjBatch
     * @param {*} stream
     */
    _putRecordBatch(schemaObjBatch, stream) {
        this._firehose.putRecordBatch(
            {
                DeliveryStreamName: stream /* required */,
                Records: schemaObjBatch.map(obj => {
                    return {
                        Data: JSON.stringify(obj)
                    };
                })
            },
            err => {
                if (err) {
                    logger.error('[Firehose] Error sending data to firehose: %o', err);
                    PromCollector.firehoseErrorCount.inc();

                    return;
                }
                logger.info('[Firehose] Sent data: %o', schemaObjBatch);
            }
        );
    }

    /**
     *
     * @param {*} schemaObjs
     * @param {*} stream
     */
    _putRecords(schemaObjs, stream) {
        let i = 0;
        const batchSize = 500;

        while (i < schemaObjs.length) {
            const schemaObjBatch = schemaObjs.slice(i, i + batchSize);

            this._putRecordBatch(schemaObjBatch, stream);
            i += batchSize;
        }
    }

    /**
     * Initiate connection to firehose stream.
     */
    connect() {
        this._firehose = new AWS.Firehose({
            region: this._awsRegion
        });

        logger.info('[Firehose] Successfully connected.');
    }

    /**
     *
     * @param {*} trackRecord
     */
    putTrackFeaturesRecord(trackFeaturesRecord) {
        this._putRecord(trackFeaturesRecord, this._trackStatsStream);
    }

    /**
     *
     * @param {*} pcRecord
     */
    putPCFeaturesRecord(pcFeaturesRecord) {
        this._putRecord(pcFeaturesRecord, this._pcStatsStream);
    }

    /**
     *
     * @param {*} meetingFeaturesRecord
     */
    putMeetingFeaturesRecord(meetingFeaturesRecord) {
        this._putRecord(meetingFeaturesRecord, this._meetingStatsStream);
    }

    /**
     *
     * @param {*} faceLandmarkRecords
     */
    putFaceLandmarkRecords(faceLandmarkRecords) {
        this._putRecords(faceLandmarkRecords, this._faceLandmarksStream);
    }
}

module.exports = FirehoseConnector;
