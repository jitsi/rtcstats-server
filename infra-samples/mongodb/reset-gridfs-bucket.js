const { MongoClient } = require('mongodb');

const {
    MONGODB_URI,
    RTCSTATS_MONGODB_NAME,
    RTCSTATS_GRIDFS_BUCKET
} = process.env;


if (!MONGODB_URI || !RTCSTATS_MONGODB_NAME || !RTCSTATS_GRIDFS_BUCKET) {
    console.error(
        'Error: MONGODB_URI, RTCSTATS_MONGODB_NAME, and RTCSTATS_GRIDFS_BUCKET '
        + 'environment variables must be set.'
    );
    process.exit(1);
}

/**
 * Resets the MongoDB GridFS bucket by dropping existing collections.
 * This ensures the bucket is clean before use.
 * @returns {Promise<void>}
 */
async function resetGridFSBucket() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('Successfully connected to MongoDB server.');

        const db = client.db(RTCSTATS_MONGODB_NAME);

        const collections = await db.listCollections({ name: `${RTCSTATS_GRIDFS_BUCKET}.files` }).toArray();

        if (collections.length > 0) {
            console.log(`Bucket '${RTCSTATS_GRIDFS_BUCKET}' already exists. Dropping and recreating...`);
            await db.collection(`${RTCSTATS_GRIDFS_BUCKET}.files`).drop();
            await db.collection(`${RTCSTATS_GRIDFS_BUCKET}.chunks`).drop();
            console.log(`Bucket '${RTCSTATS_GRIDFS_BUCKET}' dropped successfully.`);
        }

        console.log(`Bucket '${RTCSTATS_GRIDFS_BUCKET}' is ready for use.`);

    } catch (err) {
        console.error('An error occurred during GridFS setup:', err);
    } finally {
        await client.close();
        console.log('MongoDB connection closed.');
    }
}

resetGridFSBucket();
