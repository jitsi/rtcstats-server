const DynamoDataSender = require('../../DynamoDataSender');
const PromCollector = require('../mock/PromCollector');
const { mockSave, mockDocument } = require('../mock/dynamoose');

jest.mock('dynamoose', () => require('../mock/dynamoose'));
jest.mock('../../../metrics/PromCollector', () => require('../mock/PromCollector'));

describe('DynamoDataSender', () => {
    const REGION = 'test-region';
    const TABLE_NAME = 'test-table';
    const ENDPOINT = 'http://localhost:8000';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should throw an error if region is not provided', () => {
            expect(() => new DynamoDataSender(null, TABLE_NAME)).toThrow('Region is required');
        });

        it('should throw an error if table name is not provided', () => {
            expect(() => new DynamoDataSender(REGION, null)).toThrow('Table name is required');
        });

        it('should configure dynamoose with local endpoint if provided', () => {
            const dynamoose = require('dynamoose');

            // eslint-disable-next-line no-new
            new DynamoDataSender(REGION, TABLE_NAME, ENDPOINT);
            expect(dynamoose.aws.ddb.local).toHaveBeenCalledWith(ENDPOINT);
        });

        it('should not configure local endpoint if not provided', () => {
            const dynamoose = require('dynamoose');

            // eslint-disable-next-line no-new
            new DynamoDataSender(REGION, TABLE_NAME);
            expect(dynamoose.aws.ddb.local).not.toHaveBeenCalled();
        });
    });

    describe('saveEntry', () => {
        let sender;
        const entry = { dumpId: 'test-dump-id' };

        beforeEach(() => {
            sender = new DynamoDataSender(REGION, TABLE_NAME);
        });

        it('should return true on successful save', async () => {
            mockSave.mockResolvedValue(true);

            await expect(sender.saveEntry(entry)).resolves.toBe(true);
            expect(mockDocument).toHaveBeenCalledWith(entry);
            expect(mockSave).toHaveBeenCalledWith({ overwrite: false });
        });

        it('should return false if a ConditionalCheckFailedException occurs', async () => {
            const duplicateError = new Error('Duplicate entry');

            duplicateError.code = 'ConditionalCheckFailedException';
            mockSave.mockRejectedValue(duplicateError);

            await expect(sender.saveEntry(entry)).resolves.toBe(false);
        });

        it('should re-throw other errors and increment metric', async () => {
            const genericError = new Error('Something went wrong');

            mockSave.mockRejectedValue(genericError);

            await expect(sender.saveEntry(entry)).rejects.toThrow('Something went wrong');
            expect(PromCollector.dynamoErrorCount.inc).toHaveBeenCalledTimes(1);
        });
    });
});
