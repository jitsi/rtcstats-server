const assert = require('assert').strict;
const dynamoose = require('dynamoose');

const logger = require('../logging');
const PromCollector = require('../metrics/PromCollector');


/**
 * Class representing a DynamoDataSender.
 * @class
 */
class DynamoDataSender {

    /**
      * Represents a DynamoDataSender object that is responsible for sending data to DynamoDB.
      * @param {string} region - The region of the DynamoDB instance.
      * @param {string} tableName - The name of the table in DynamoDB.
      * @param {string} endpoint - The endpoint of the DynamoDB instance.
      * @constructor
      */
    constructor(region, tableName, endpoint) {

        assert(region, 'Region is required when initializing DynamoDB');
        assert(tableName, 'Table name is required when initializing DynamoDB');

        // Set region to avoid aws config error
        dynamoose.aws.sdk.config.update({
            region
        });

        // Used for working with local data
        // Requires a local DynamoDB instance running
        if (endpoint) {
            logger.info('[Dynamo] Using local dynamo instance');
            dynamoose.aws.ddb.local(endpoint);
        }

        this.Document = dynamoose.model(
            tableName,
            {
                conferenceId: String,
                conferenceUrl: String,
                dumpId: String,
                baseDumpId: String,
                userId: String,
                app: String,
                sessionId: String,
                startDate: Number,
                endDate: Number
            },
            { create: false }
        );
    }

    /**
     *
     * Saves an entry to DynamoDB.
     * @param {Object} entry - The entry to be saved.
     * @param {string} entry.dumpId - The client ID.
     * @param {string} entry.conferenceId - The conference ID.
     * @param {string} entry.conferenceUrl - The conference URL.
     * @param {string} entry.userId - The user ID.
     * @param {string} entry.app - The app.
     * @param {string} entry.sessionId - The session ID.
     * @param {string} entry.baseDumpId - The base dump ID.
     * @param {number} entry.startDate - The start date.
     * @param {number} entry.endDate - The end date.
     * @returns {Promise<boolean>} - A promise that resolves to true if the entry is saved successfully,
     * or false if there is a duplicate entry.
     */
    async saveEntry(entry) {
        const { dumpId } = entry;

        try {
            const document = new this.Document(entry);

            // overwrite: false will returns an exception in case the entry already exists
            await document.save({ overwrite: false });
            logger.info('[Dynamo] Saved metadata for statsSessionId:', dumpId);

            return true;
        } catch (error) {
            // Dynamo returns this error code in case there is a duplicate entry
            if (error.code === 'ConditionalCheckFailedException') {
                logger.warn('[Dynamo] duplicate entry for statsSessionId: %s; error: %o', dumpId, error);

                return false;
            }

            PromCollector.dynamoErrorCount.inc();

            throw error;
        }
    }
}

module.exports = DynamoDataSender;
