const S3Manager = require('../../S3Manager');
const AWS = require('../mock/aws-sdk');
const { mockUploadPromise, mockGetSignedUrlPromise, mockS3Instance, mockUpdate } = require('../mock/aws-sdk');
const fs = require('../mock/fs');
const { mockReadStream } = require('../mock/fs');

jest.mock('aws-sdk', () => require('../mock/aws-sdk'));
jest.mock('fs', () => require('../mock/fs'));
jest.mock('zlib', () => require('../mock/zlib'));

describe('S3Manager', () => {
    const baseConfig = {
        region: 'test-region',
        bucket: 'test-bucket',
        signedLinkExpirationSec: 3600
    };

    beforeEach(() => {
        jest.clearAllMocks();
        AWS.config = { update: mockUpdate };
    });

    describe('constructor', () => {
        it('should throw an error if region is missing', () => {
            expect(() => new S3Manager({ bucket: 'b' })).toThrow();
        });

        it('should throw an error if bucket is missing', () => {
            expect(() => new S3Manager({ region: 'r' })).toThrow();
        });

        it('should configure AWS SDK and create an S3 instance', () => {
            // eslint-disable-next-line no-new
            new S3Manager(baseConfig);
            expect(mockUpdate).toHaveBeenCalledWith(baseConfig.region);
            expect(AWS.S3).toHaveBeenCalled();
        });
    });

    describe('put', () => {
        it('should upload a gzipped stream and resolve on success', async () => {
            const manager = new S3Manager(baseConfig);

            mockUploadPromise.mockResolvedValue({ Location: 's3://location' });

            await expect(manager.put('test-key', '/path/to/file')).resolves.toEqual({ Location: 's3://location' });

            expect(fs.createReadStream).toHaveBeenCalledWith('/path/to/file', { encoding: 'utf-8' });
            expect(mockS3Instance.upload).toHaveBeenCalledWith({
                Bucket: baseConfig.bucket,
                Key: 'test-key',
                Body: mockReadStream.pipe()
            });
        });

        it('should reject if upload fails', async () => {
            const manager = new S3Manager(baseConfig);
            const mockError = new Error('S3 Upload Failed');

            mockUploadPromise.mockRejectedValue(mockError);

            await expect(manager.put('test-key', '/path/to/file')).rejects.toThrow('S3 Upload Failed');
        });
    });

    describe('getSignedUrl', () => {
        it('should call getSignedUrlPromise with correct parameters', async () => {
            const manager = new S3Manager(baseConfig);
            const signedUrl = 'https://s3.amazonaws.com/signed-url';

            mockGetSignedUrlPromise.mockResolvedValue(signedUrl);

            const result = await manager.getSignedUrl('test-key');

            expect(result).toBe(signedUrl);
            expect(mockS3Instance.getSignedUrlPromise).toHaveBeenCalledWith('getObject', {
                Bucket: baseConfig.bucket,
                Key: 'test-key',
                Expires: baseConfig.signedLinkExpirationSec
            });
        });
    });
});
