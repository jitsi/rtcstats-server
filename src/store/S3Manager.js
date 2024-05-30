const AWS = require('aws-sdk');
const { assert } = require('console');
const fs = require('fs');
const zlib = require('zlib');

/**
 * S3Manager is a class that wraps the AWS SDK for S3 and provides additional functionality
 *
 * @class S3Manager
 */
class S3Manager {

    /**
     * C'tor
     *
     * @param {*} config - Configuration object that contains S3 settings such as region, bucket, etc.
     */
    constructor(config) {
        const { region, useIAMAuth, bucket, signedLinkExpirationSec } = config;

        assert(region);
        assert(bucket);

        AWS.config.update(region);

        if (!useIAMAuth) {
            AWS.config = config;
        }

        this.s3bucket = new AWS.S3({
            params: {
                Bucket: bucket
            }
        });

        this.bucket = bucket;
        this.signedLinkExpirationSec = signedLinkExpirationSec;
    }

    /**
     * Puts a file to an S3 bucket and compresses it using gzip.
     *
     * @param {string} key - the key to be used to store the file in S3 bucket
     * @param {string} filename - path of the file that needs to be uploaded to the S3 bucket
     * @returns {Promise} - A promise that is resolved when the file is successfully uploaded to the S3 bucket.
     */
    put(key, filename) {
        const readStream = fs.createReadStream(filename, { encoding: 'utf-8' });
        const gzipStream = zlib.createGzip();
        const compressedStream = readStream.pipe(gzipStream);

        return this.s3bucket.upload({
            Key: key,
            Body: compressedStream
        }).promise();
    }

    /**
     * Returns a signed URL for a file in the S3 bucket.
     *
     * @param {string} key - The key of the file in the S3 bucket.
     * @returns {Promise<string>} - A promise that resolves to the signed URL of the file.
     */
    getSignedUrl(key) {
        return this.s3bucket.getSignedUrlPromise('getObject', {
            Bucket: this.bucket,
            Key: key,
            Expires: this.signedLinkExpirationSec
        });
    }

    /**
     * Normalizes the key name for an S3 object by appending a file extension.
     *
     * @param {string} key - The original key name for the S3 object.
     * @returns {string} The normalized key name for the S3 object.
     */
    _normalizeS3KeyName(key) {
        return `${key}.gz`;
    }
}

module.exports = S3Manager;
