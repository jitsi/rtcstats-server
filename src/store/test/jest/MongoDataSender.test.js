const MongoDataSender = require('../../MongoDataSender');
const PromCollector = require('../mock/PromCollector');
const mongoose = require('../mock/mongoose');
const { mockSave, mockModel } = require('../mock/mongoose');

jest.mock('mongoose', () => require('../mock/mongoose'));
jest.mock('../../../metrics/PromCollector', () => require('../mock/PromCollector'));

describe('MongoDataSender', () => {
    const COLLECTION_NAME = 'test-collection';

    beforeEach(() => {
        jest.clearAllMocks();
        mongoose.connection.readyState = 1;
    });

    describe('constructor', () => {
        it('should throw an error if collection name is not provided', () => {
            expect(() => new MongoDataSender(null)).toThrow('\'collectionName\' is required when initializing MongoDB');
        });

        it('should throw an error if mongoose connection is not ready', () => {
            mongoose.connection.readyState = 0;

            expect(() => new MongoDataSender(COLLECTION_NAME)).toThrow('[MongoDB] Connection is not established.');
        });

        it('should successfully create an instance if connection is ready', () => {
            mongoose.connection.readyState = 1;

            expect(() => new MongoDataSender(COLLECTION_NAME)).not.toThrow();
        });
    });

    describe('saveEntry', () => {
        let sender;
        const entry = { dumpId: 'test-dump-id' };

        beforeEach(() => {
            sender = new MongoDataSender(COLLECTION_NAME);
        });

        it('should return true on successful save', async () => {
            mockSave.mockResolvedValue(true);

            await expect(sender.saveEntry(entry)).resolves.toBe(true);
            expect(mockModel).toHaveBeenCalledWith(entry);
            expect(mockSave).toHaveBeenCalled();
        });

        it('should return false if a duplicate key error (11000) occurs', async () => {
            const duplicateError = new Error('Duplicate entry');

            duplicateError.code = 11000;
            mockSave.mockRejectedValue(duplicateError);

            await expect(sender.saveEntry(entry)).resolves.toBe(false);
        });

        it('should re-throw other errors and increment metric', async () => {
            const genericError = new Error('Something went wrong');

            mockSave.mockRejectedValue(genericError);

            await expect(sender.saveEntry(entry)).rejects.toThrow('Something went wrong');
            expect(PromCollector.mongodbErrorCount.inc).toHaveBeenCalledTimes(1);
        });
    });
});
