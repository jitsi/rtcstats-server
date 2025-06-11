const AWS = require('aws-sdk');

const {
    RTCSTATS_METADATA_TABLE,
    AWS_REGION: region,
    RTCSTATS_DYNAMODB_ENDPOINT: endpoint
} = process.env;

const config = endpoint ? { endpoint,
    region } : { region };

AWS.config.update(config);

const tableConfig = {
    TableName: RTCSTATS_METADATA_TABLE,
    AttributeDefinitions: [
        {
            AttributeName: 'conferenceId',
            AttributeType: 'S'
        },
        {
            AttributeName: 'conferenceUrl',
            AttributeType: 'S'
        },
        {
            AttributeName: 'dumpId',
            AttributeType: 'S'
        },
        {
            AttributeName: 'startDate',
            AttributeType: 'N'
        },
        {
            AttributeName: 'sessionId',
            AttributeType: 'S'
        }
    ],
    KeySchema: [
        {
            AttributeName: 'conferenceId',
            KeyType: 'HASH'
        },
        {
            AttributeName: 'dumpId',
            KeyType: 'RANGE'
        }
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
    },
    GlobalSecondaryIndexes: [
        {
            IndexName: 'conferenceUrl-startDate-index',
            KeySchema: [
                {
                    AttributeName: 'conferenceUrl',
                    KeyType: 'HASH'
                },
                {
                    AttributeName: 'startDate',
                    KeyType: 'RANGE'
                }
            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        },
        {
            IndexName: 'conferenceId-startDate-index',
            KeySchema: [
                {
                    AttributeName: 'conferenceId',
                    KeyType: 'HASH'
                },
                {
                    AttributeName: 'startDate',
                    KeyType: 'RANGE'
                }
            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        },
        {
            IndexName: 'sessionId-startDate-index',
            KeySchema: [
                {
                    AttributeName: 'sessionId',
                    KeyType: 'HASH'
                },
                {
                    AttributeName: 'startDate',
                    KeyType: 'RANGE'
                }
            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        }
    ],
    StreamSpecification: {
        StreamEnabled: false
    }
};

const ddb = new AWS.DynamoDB();


const createTable = () => ddb.createTable(tableConfig, err => {
    if (err) {
        console.log('Could not create table', err);
    }
});

const deleteTable = () => new Promise((resolve, reject) => {
    ddb.deleteTable({
        TableName: RTCSTATS_METADATA_TABLE
    }, (err, data) => {
        if (err) {
            reject(err);
        } else {
            console.log(data);
            resolve(data);
        }
    });
});

ddb.listTables(async (err, data) => {
    if (err) {
        console.error('Could not list tables', err);

        return;
    }

    const tableExists = Boolean(data.TableNames.find(t => t === RTCSTATS_METADATA_TABLE));

    if (tableExists) {
        try {
            console.log('Table exists, deleting and recreating...');

            await deleteTable();
            createTable();
        // eslint-disable-next-line no-catch-shadow, no-shadow
        } catch (err) {
            console.error('Could not delete table', err);
        }
    } else {
        console.log('Creating new table...');
        createTable();
    }
});
