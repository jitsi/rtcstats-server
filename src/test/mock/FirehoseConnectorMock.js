const logger = require('../../logging'); // Assuming you have a logger module

/**
/**
 * Represents a mock implementation of a Firehose connector.
 */
class FirehoseConnectorMock {
    /**
     * Creates a new instance of FirehoseConnectorMock.
     */
    constructor() {
        // Mock implementation of constructor
        logger.debug('[Firehose] Created a new FirehoseConnectorMock instance.');
    }

    /**
     * Connects to the Firehose.
     */
    connect() {
        // Mock implementation of connect
        logger.debug('[Firehose] Successfully connected.');
    }

    /**
     * Puts a track features record to the track stats stream.
     * @param {Object} trackFeaturesRecord - The track features record.
     */
    putTrackFeaturesRecord(trackFeaturesRecord) {
        // Mock implementation of putTrackFeaturesRecord
        logger.debug('Putting track features record:', trackFeaturesRecord);
    }

    /**
     * Puts a PC features record to the PC stats stream.
     * @param {Object} pcFeaturesRecord - The PC features record.
     */
    putPCFeaturesRecord(pcFeaturesRecord) {
        // Mock implementation of putPCFeaturesRecord
        logger.debug('Putting PC features record:', pcFeaturesRecord);
    }

    /**
     * Puts a meeting features record to the meeting stats stream.
     * @param {Object} meetingFeaturesRecord - The meeting features record.
     */
    putMeetingFeaturesRecord(meetingFeaturesRecord) {
        // Mock implementation of putMeetingFeaturesRecord
        logger.debug('Putting meeting features record:', meetingFeaturesRecord);
    }

    /**
     * Puts face landmark records to the face landmarks stream.
     * @param {Object[]} faceLandmarkRecords - The array of face landmark records.
     */
    putFaceLandmarkRecords(faceLandmarkRecords) {
        // Mock implementation of putFaceLandmarkRecords
        logger.debug('Putting face landmark records:', faceLandmarkRecords);
    }

    /**
     * Puts meeting event records to the meeting event stream.
     * @param {Object[]} meetingEventRecords - The array of meeting event records.
     */
    putMeetingEventRecords(meetingEventRecords) {
        // Mock implementation of putMeetingEventRecords
        logger.debug('Putting meeting event records:', meetingEventRecords);
    }
}

module.exports = FirehoseConnectorMock;
