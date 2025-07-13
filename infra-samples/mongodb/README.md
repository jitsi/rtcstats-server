# Samples for MongoDB

MongoDB collection and GridFS bucket are created automatically on first use, so it is not necessary to run these scripts before the initial application startup. Their primary purpose is to reset the environment to a clean state.

## GridFS
WebRTC statistics are stored as ZIP files on GridFS bucket.

### Run
```
$ node ./infra-samples/mongodb/reset-gridfs-bucket.js
```

## MongoDB
MongoDB manages meeting metadata. You can see the schema in [API.md](../../API.md#identity-request)

### Run
```
$ node ./infra-samples/mongodb/reset-mongodb-indexes.js
```