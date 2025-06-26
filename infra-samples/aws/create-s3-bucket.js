const AWS = require('aws-sdk');

const {
    RTCSTATS_S3_BUCKET,
    AWS_REGION: region,
    RTCSTATS_S3_ENDPOINT: endpoint
} = process.env;

const config = { region };

AWS.config.update(config);

const s3Config = endpoint ? { endpoint } : {};

const bucketConfig = {
    Bucket: RTCSTATS_S3_BUCKET
};

const s3 = new AWS.S3(s3Config);


// --- Workaround for LocalStack S3 endpoint issue ---
// The AWS SDK v2 may not handle the endpoint URL correctly, leading to an `InvalidLocationConstraint` error.
// To fix this, we explicitly set only the hostname to an internal property of the SDK.
// See: https://github.com/localstack/localstack/issues/8000
if (endpoint) {
    const url = new URL(endpoint);

    s3.api.globalEndpoint = url.hostname;
}

s3.createBucket(bucketConfig, err => {
    if (err) {
        console.error('Could not create bucket:', err);
    }
});
