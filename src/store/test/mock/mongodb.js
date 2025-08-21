const mockUploadStream = {
    on: jest.fn()
};

const mockBucketInstance = {
    openUploadStream: jest.fn().mockReturnValue(mockUploadStream)
};

const GridFSBucket = jest.fn().mockImplementation(() => mockBucketInstance);

module.exports = {
    GridFSBucket,
    mockUploadStream,
    mockBucketInstance
};
