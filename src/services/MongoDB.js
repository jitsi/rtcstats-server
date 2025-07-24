const assert = require('assert').strict;
const config = require('config');
const mongoose = require('mongoose');

const logger = require('../logging');
const GridFSManager = require('../store/GridFSManager');
const MetadataStorageHandler = require('../store/MetadataStorageHandler');
const MongoDataSender = require('../store/MongoDataSender');

/**
 * Connects to a MongoDB database using Mongoose.
 */
async function connectToMongoDB() {
    const {
        mongodb: {
            uri,
            dbName
        } = {}
    } = config;

    assert(uri, 'MongoDB URI is required when initializing MongoDB');
    assert(dbName, 'Database name is required when initializing MongoDB');

    try {
        await mongoose.connect(uri, { dbName });
        logger.info('[App] MongoDB connected');
    } catch (err) {
        logger.error('[App] MongoDB connection error:', err);
        throw err;
    }
}

/**
 * Initialize the service that will handle the storage of metadata entries.
 */
function setupMetadataStorageHandler() {
    const {
        mongodb: {
            collectionName
        } = {}
    } = config;

    if (collectionName) {
        const storageInterface = new MongoDataSender(collectionName);

        return new MetadataStorageHandler(storageInterface);
    }

    logger.warn('[App] MongoDB is not configured!');
}

/**
 * Initialize the service which will persist the dump files.
 *
 */
function setupDumpStorage() {
    let store;

    const {
        mongodb: {
            gridfsBucketName
        } = {}
    } = config;

    if (gridfsBucketName) {
        store = new GridFSManager(gridfsBucketName);
    } else {
        logger.warn('[App] MongoDB GridFS is not configured!');
    }

    return store;
}

module.exports = {
    connectToMongoDB,
    setupMetadataStorageHandler,
    setupDumpStorage
};
