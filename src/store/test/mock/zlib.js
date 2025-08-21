const mockGzipStream = {
    pipe: jest.fn()
};

mockGzipStream.pipe.mockReturnThis();

module.exports = {
    createGzip: jest.fn().mockReturnValue(mockGzipStream),
    mockGzipStream
};
