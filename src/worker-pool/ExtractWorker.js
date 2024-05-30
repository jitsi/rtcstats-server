const { parentPort, workerData, isMainThread } = require('worker_threads');

const logger = require('../logging');
const { RequestType, ResponseType } = require('../utils/utils');

const DumpFileProcessor = require('./DumpFileProcessor');

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
    default: {
        logger.error('[Extract] Unsupported request: %o', request);
    }
    }
});

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
        logger.info('[Extract] Worker is processing statsSessionId: %o', body);

        const dumpFileProcessor = new DumpFileProcessor(body);
        const result = await dumpFileProcessor.processStatsFile();

        postMessage(ResponseType.DONE, result);
    } catch (error) {
        postMessage(ResponseType.ERROR, {
            dumpMetadata: body,
            error: error.stack
        });
    }
}


