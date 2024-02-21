const logger = require('../../logging');

/**
 * Class representing a DynamoDataSenderMock.
 */
class DynamoDataSenderMock {
    /**
     * Represents a DynamoDataSenderMock object that is responsible for sending data to DynamoDB.
     * @constructor
     */
    constructor() {
        // TODO: Sommehting
        console.log('DynamoDataSenderMock constructor');
    }

    /**
     * TODO: Add JSDoc
     * @param {*} entry
     */
    async saveEntry(entry) {
        logger.info('[Dynamo Mock] Saving entry: %o', entry);

        return true;
    }

    /**
     * Resets the state of the mock.
     */
    reset() {
        this.saveEntry.reset();
    }
}

module.exports = DynamoDataSenderMock;
