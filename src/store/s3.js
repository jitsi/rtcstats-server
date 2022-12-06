const AWS = require('aws-sdk');
const fs = require('fs');
const zlib = require('zlib');

const logger = require('../logging');

/**
 * We add .gz add the end of the key name in order to indicate that the s3 file is compressed.
 *
 * @param {string} key - Unique key assigned to the dump.
 * @returns {string} Normalized name.
 */
function getNormalizedS3KeyName(key) {
    return `${key}.gz`;
}

module.exports = function(config) {

    const { region, useIAMAuth, bucket, signedLinkExpirationSec } = config;

    AWS.config.update(region);

    if (!useIAMAuth) {
        AWS.config = config;
    }

    const s3bucket = new AWS.S3({
        params: {
            Bucket: bucket
        }
    });

    const configured = Boolean(bucket);

    return {
        put(key, filename) {
            return new Promise((resolve, reject) => {
                if (!configured) {
                    logger.warn('[S3] No bucket configured for storage');

                    return resolve(); // not an error.
                }
                fs.readFile(filename, { encoding: 'utf-8' }, (fsErr, fsData) => {
                    if (fsErr) {
                        return reject(fsErr);
                    }
                    zlib.gzip(fsData, (err, data) => {
                        if (err) {
                            return reject(err);
                        }
                        s3bucket.upload({
                            Key: getNormalizedS3KeyName(key),
                            Body: data
                        }, s3Err => {
                            if (s3Err) {
                                return reject(s3Err);
                            }
                            resolve();
                        });
                    });
                });
            });
        },
        async getSignedUrl(key) {
            return await s3bucket.getSignedUrlPromise('getObject', { Bucket: bucket,
                Key: getNormalizedS3KeyName(key),
                Expires: signedLinkExpirationSec }
            );
        }
    };
};
