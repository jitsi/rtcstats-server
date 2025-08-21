const mockReadStream = {
    pipe: jest.fn()
};

mockReadStream.pipe.mockReturnThis();

module.exports = {
    createReadStream: jest.fn().mockReturnValue(mockReadStream),
    mockReadStream
};
