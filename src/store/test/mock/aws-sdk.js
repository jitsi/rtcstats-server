const mockUploadPromise = jest.fn();
const mockGetSignedUrlPromise = jest.fn();
const mockUpdate = jest.fn();

const mockS3Instance = {
    upload: jest.fn().mockReturnValue({ promise: mockUploadPromise }),
    getSignedUrlPromise: mockGetSignedUrlPromise
};
const mockS3 = jest.fn().mockImplementation(() => mockS3Instance);

const mockAWS = {
    config: {
        update: mockUpdate
    },
    S3: mockS3
};

module.exports = {
    ...mockAWS,
    mockUploadPromise,
    mockGetSignedUrlPromise,
    mockS3Instance,
    mockUpdate
};
