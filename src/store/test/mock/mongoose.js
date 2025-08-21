const mockSave = jest.fn();
const mockModelInstance = {
    save: mockSave
};
const mockModel = jest.fn().mockImplementation(() => mockModelInstance);
const mockMongoose = {
    connection: {
        readyState: 0
    },
    Schema: jest.fn(),
    models: {},
    model: jest.fn().mockReturnValue(mockModel)
};

module.exports = {
    ...mockMongoose,
    mockSave,
    mockModel
};
