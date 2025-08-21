module.exports = {
    dynamoErrorCount: {
        inc: jest.fn()
    },
    mongodbErrorCount: {
        inc: jest.fn()
    }
};
