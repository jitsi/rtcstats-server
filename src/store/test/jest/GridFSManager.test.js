const GridFSManager = require('../../GridFSManager');
const fs = require('../mock/fs');
const { GridFSBucket, mockUploadStream, mockBucketInstance } = require('../mock/mongodb');
const mongoose = require('../mock/mongoose');
const zlib = require('../mock/zlib');

jest.mock('fs', () => require('../mock/fs'));
jest.mock('mongodb', () => require('../mock/mongodb'));
jest.mock('mongoose', () => require('../mock/mongoose'));
jest.mock('zlib', () => require('../mock/zlib'));
jest.mock('../../../logging', () => require('../mock/logging'));

describe('GridFSManager', () => {
    const BUCKET_NAME = 'test-bucket';

    beforeEach(() => {
        jest.clearAllMocks();
        mongoose.connection.readyState = 1;
        mongoose.connection.db = {};
    });

    describe('constructor', () => {
        it('should throw an error if bucketName is not provided', () => {
            expect(() => new GridFSManager()).toThrow('GridFS bucket name is required');
        });

        it('should throw an error if mongoose connection is not ready', () => {
            mongoose.connection.readyState = 0;
            expect(() => new GridFSManager(BUCKET_NAME)).toThrow('[GridFS] MongoDB connection is not established.');
        });

        it('should create a GridFSBucket instance on success', () => {
            // eslint-disable-next-line no-new
            new GridFSManager(BUCKET_NAME);
            expect(GridFSBucket).toHaveBeenCalledWith(mongoose.connection.db, { bucketName: BUCKET_NAME });
        });
    });

    describe('put', () => {
        it('should resolve the promise when uploadStream emits "finish"', async () => {
            const manager = new GridFSManager(BUCKET_NAME);

            mockUploadStream.on.mockImplementation((event, callback) => {
                if (event === 'finish') {
                    callback();
                }
            });

            const putPromise = manager.put('test-key', '/path/to/file');

            await expect(putPromise).resolves.toBeUndefined();

            expect(fs.createReadStream).toHaveBeenCalledWith('/path/to/file');
            expect(zlib.createGzip).toHaveBeenCalled();
            expect(mockBucketInstance.openUploadStream).toHaveBeenCalledWith('test-key', expect.any(Object));
        });

        it('should reject the promise when uploadStream emits "error"', async () => {
            const manager = new GridFSManager(BUCKET_NAME);
            const mockError = new Error('Upload failed');

            mockUploadStream.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    callback(mockError);
                }
            });

            const putPromise = manager.put('test-key', '/path/to/file');

            await expect(putPromise).rejects.toThrow('Upload failed');
        });
    });
});
