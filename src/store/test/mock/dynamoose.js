const mockSave = jest.fn();

const mockDocumentInstance = {
    save: mockSave
};

const mockDocument = jest.fn().mockImplementation(() => mockDocumentInstance);

const mockDynamoose = {
    aws: {
        sdk: {
            config: {
                update: jest.fn()
            }
        },
        ddb: {
            local: jest.fn()
        }
    },
    model: jest.fn().mockReturnValue(mockDocument)
};

module.exports = {
    ...mockDynamoose,
    mockSave,
    mockDocument
};
