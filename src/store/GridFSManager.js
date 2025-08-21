const assert = require('assert');
const fs = require('fs');
const { GridFSBucket } = require('mongodb');
const mongoose = require('mongoose');
const zlib = require('zlib');

const logger = require('../logging');

/**
 * GridFsManager is a class that wraps the MongoDB GridFS functionality
 *
 * @class GridFSManager
 */
class GridFSManager {

    /**
     * C'tor
     * @param {string} bucketName - The name of the GridFS bucket
     */
    constructor(bucketName) {

        assert(bucketName, 'GridFS bucket name is required when initializing GridFSManager');

        // Connection needs to be established before using GridFSManager
        if (mongoose.connection.readyState !== 1) {
            throw new Error('[GridFS] MongoDB connection is not established.');
        }

        const db = mongoose.connection.db;

        this._bucket = new GridFSBucket(db, { bucketName });

    }

    /**
     * Puts a file to an GridFS bucket and compresses it using gzip.
     *
     * @param {string} key - the key to be used to store the file in GridFS bucket
     * @param {string} filename - path of the file that needs to be uploaded to the GridFS bucket
     * @returns {Promise} - A promise that is resolved when the file is successfully uploaded to the GridFS bucket.
     */
    put(key, filename) {

        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(filename);
            const gzipStream = zlib.createGzip();

            const uploadStream = this._bucket.openUploadStream(key, {
                contentType: 'application/gzip'
            });

            readStream.pipe(gzipStream).pipe(uploadStream);

            uploadStream.on('finish', () => {
                logger.info(`[GridFS] Successfully uploaded ${key}.`);
                resolve();
            });

            uploadStream.on('error', err => {
                logger.error(`[GridFS] Error uploading ${key}. Error: %o`, err);
                reject(err);
            });
        });
    }
}

module.exports = GridFSManager;
