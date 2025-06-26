# Samples for AWS

## S3
WebRTC statistics are stored as ZIP files on S3.

### Run
```
$ node ./infra-samples/aws/create-s3-bucket.js
```

## DynamoDB
DynamoDB manages meeting metadata. You can see the schema in [API.md](../../API.md#identity-request)

### Run
```
$ node ./infra-samples/aws/create-dynamodb-table.js
```