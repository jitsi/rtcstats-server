const { parentPort, workerData, isMainThread } = require('worker_threads');

const FeatureExtractor = require('../features/FeatureExtractor');
const LeftoverExtractor = require('../features/LeftoverExtractor');
const logger = require('../logging');
const { RequestType, ResponseType } = require('../utils/utils');

if (isMainThread) {

    throw new Error('[Extract] Extract worker can not run on main thread');
}

logger.info('[Extract] Running feature extract worker thread: %o', workerData);

/**
 * Post a message to the parent port.
 *
 * @param {string} type - The type of the response.
 * @param {Object} body - The body of the response.
 */
function postMessage(type, body) {
    parentPort.postMessage({
        type,
        body
    });
}

parentPort.on('message', request => {
    switch (request.type) {
    case RequestType.PROCESS: {
        processRequest(request);
        break;
    }
    case RequestType.LEFTOVER_PROCESS: {
        processLeftoverDump(request);
        break;
    }
    default: {
        logger.error('[Extract] Unsupported request: %o', request);
    }
    }
});

/**
 * Process a leftover dump request.
 *
 * @param {Object} request - The request to process. The request object should have the following structure:
 * @param {string} request.type - The type of the request.
 * @param {Object} request.body - The body of the request, containing metadata about the dump to be processed.
 * @param {string} request.body.clientId - The ID of the dump file to be processed.
 */
async function processLeftoverDump({ body }) {
    try {
        const { clientId = '' } = body;

        logger.info('[Extract] Worker is processing leftover dump: %s', clientId);

        const leftoverExtractor = new LeftoverExtractor(body);
        const extractedData = await leftoverExtractor.extract();

        postMessage(ResponseType.LEFTOVER_PROCESS_DONE, {
            dumpInfo: body,
            extractedData
        });
    } catch (error) {
        postMessage(ResponseType.ERROR, {
            dumpInfo: body,
            error: error.stack
        });
    }
}

/**
 * Process a request.
 *
 * @param {Object} request - The request to process. The request object should have the following structure:
 * @param {string} request.type - The type of the request.
 * @param {Object} request.body - The body of the request, containing metadata about the dump to be processed.
 * @param {string} request.body.clientId - The ID of the dump file to be processed.
 */
async function processRequest({ body }) {
    try {
        const { clientId = '' } = body;

        logger.info('[Extract] Worker is processing statsSessionId: %s', clientId);

        const featureExtractor = new FeatureExtractor(body);
        const features = await featureExtractor.extract();

        postMessage(ResponseType.DONE, {
            dumpInfo: body,
            features
        });
    } catch (error) {
        postMessage(ResponseType.ERROR, {
            dumpInfo: body,
            error: error.stack
        });
    }
}


