const assert = require('assert').strict;
const mongoose = require('mongoose');

const logger = require('../logging');
const PromCollector = require('../metrics/PromCollector');


/**
 * Class representing a MongoDataSender.
 * @class
 */
class MongoDataSender {

    /**
      * Represents a MongoDataSender object that is responsible for sending data to MongoDB.
      * @param {string} collectionName - The name of the collection to store metadata.
      * @constructor
      */
    constructor(collectionName) {

        assert(collectionName, '\'collectionName\' is required when initializing MongoDB');

        // Connection needs to be established before using MongoDataSender
        if (mongoose.connection.readyState !== 1) {
            throw new Error('[MongoDB] Connection is not established.');
        }

        const metadataSchema = new mongoose.Schema({
            conferenceId: {
                type: String,
                index: true
            },
            conferenceUrl: {
                type: String,
                index: true
            },
            dumpId: String,
            userId: String,
            app: String,
            sessionId: {
                type: String,
                index: true
            },
            logsId: String,
            startDate: {
                type: Number,
                index: true
            },
            endDate: Number
        }, {
            collection: collectionName,
            versionKey: false
        });

        // Derive a unique model name from the collection name to avoid conflicts
        const modelName = `Metadata_${collectionName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        this._model = mongoose.models[modelName] || mongoose.model(modelName, metadataSchema);

    }

    /**
     *
     * Saves an entry to MongoDB.
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

        logger.info('[MongoDB] Saving metadata for statsSessionId:', dumpId);

        try {
            const document = new this._model(entry);

            logger.info('[MongoDB] Saving metadata for statsSessionId:', dumpId, 'with data:', entry);

            await document.save();
            logger.info('[MongoDB] Saved metadata for statsSessionId:', dumpId);

            return true;
        } catch (error) {
            // MongoDB returns this error code in case there is a duplicate entry
            if (error.code === 11000) {
                logger.warn('[MongoDB] duplicate entry for statsSessionId: %s; error: %o', dumpId, error);

                return false;
            }

            PromCollector.mongodbErrorCount.inc();

            throw error;
        }
    }
}

module.exports = MongoDataSender;
