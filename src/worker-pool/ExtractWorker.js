const { parentPort, workerData, isMainThread } = require('worker_threads');

const FeatureExtractor = require('../features/FeatureExtractor');
const logger = require('../logging');
const { RequestType, ResponseType } = require('../utils/utils');


if (isMainThread) {

    throw new Error('[Extract] Extract worker can not run on main thread');
}

logger.info('[Extract] Running feature extract worker thread: %o', workerData);

parentPort.on('message', request => {
    switch (request.type) {
    case RequestType.PROCESS: {
        const { body: { clientId = '' } = {} } = request;

        logger.info('[Extract] Worker is processing statsSessionId: %s', clientId);
        processRequest(request);
        break;
    }
    default: {
        logger.error('[Extract] Unsupported request: %o', request);
    }
    }
});

/**
 *
 * @param {*} request
 */
async function processRequest(request) {
    try {
        const featureExtractor = new FeatureExtractor(request.body);
        const { features, dumpInfo } = await featureExtractor.extract();

        logger.info(`Tomi feature_extractor: ${JSON.stringify(features)}`);
        parentPort.postMessage({ type: ResponseType.DONE,
            body: { dumpInfo: {
                ...dumpInfo,
                ...request.body
            },
            features } });
    } catch (error) {
        parentPort.postMessage({
            type: ResponseType.ERROR,
            body: { dumpInfo: request.body,
                error: error.stack }
        });
    }
}


