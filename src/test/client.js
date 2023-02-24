/* eslint-disable no-invalid-this */
/* eslint-disable no-multi-str */
const assert = require('assert').strict;
const { EventEmitter } = require('events');
const fs = require('fs');
const LineByLine = require('line-by-line');
const WebSocket = require('ws');


const server = require('../app');
const logger = require('../logging');
const { uuidV4, ResponseType } = require('../utils/utils');

const dumpPath = './src/test/dumps/';
const jestResultsPath = './src/test/jest/results/';

let testCheckRouter;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // ignore self-signed cert

const BrowserUASamples = Object.freeze({
    CHROME:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko)'
        + ' Chrome/87.0.4280.27 Safari/537.36',
    FIREFOX: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0',
    SAFARI:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko)'
        + ' Version/14.0 Safari/605.1.15'
});

const ProtocolV = Object.freeze({
    LEGACY: '3_LEGACY',
    STANDARD: '3_STANDARD'
});

const DisconnectLineMarker = '--disconnect--';

/**
 *
 */
class RtcstatsConnection extends EventEmitter {
    /**
     *
     * @param {*} param0
     */
    constructor({ id, serverUrl, filePath, readDelay = 1000, wsOptions, protocolV, statsSessionId }) {
        super();
        this.id = id;
        this.filePath = filePath;
        this.serverUrl = serverUrl;
        this.wsOptions = wsOptions;
        this.readDelay = readDelay;
        this.protocolV = protocolV;
        this.statsSessionId = statsSessionId;
        this.lastLine = 0;
        this.disconnected = false;
    }

    /**
     *
     */
    getStatsSessionId() {
        return this.statsSessionId;
    }

    /**
     *
     */
    connect() {
        this.startWSOpen = new Date();
        this.ws = new WebSocket(this.serverUrl, this.protocolV, this.wsOptions);

        this.ws.on('open', this._open);
        this.ws.on('close', this._close);
        this.ws.on('error', this._error);
    }

    /**
     *
     * @param {*} data
     */
    _sendStats(data) {
        const statsRequest = {
            statsSessionId: this.statsSessionId,
            type: 'stats-entry',
            data
        };

        this._sendRequest(statsRequest);
    }

    /**
     *
     * @param {*} request
     */
    _sendRequest(request) {
        this.ws.send(JSON.stringify(request));
    }

    /**
     *
     */
    _open = () => {
        this.disconnected = false;

        const endWSOpen = new Date() - this.startWSOpen;

        if (this.lastLine === 0) {
            logger.info(`Connected ws ${this.id} setup time ${endWSOpen}`);
        } else {
            logger.info(`Reconnected ws ${this.id} setup time ${endWSOpen}`);
        }

        this.lineReader = new LineByLine(this.filePath);
        let lineNumber = 0;

        this.lineReader.on('line', line => {
            if (((lineNumber > this.lastLine) && !this.disconnected)
                || lineNumber === 0) {
                if (line === DisconnectLineMarker) {
                    this.disconnected = true;
                    this.lastLine = lineNumber;
                    this._disconnect();
                    this.lineReader.close();
                } else {
                    this._sendStats(line);
                }
            }
            lineNumber++;
        });

        this.lineReader.on('end', () => {
            if (!this.disconnected) {
                this.ws.close();
            }
        });

        this.lineReader.on('error', e => {
            logger.error(e);
        });
    };

    _close = () => {
        const closedAfter = new Date() - this.startWSOpen;

        logger.info(`Closed ws ${this.id} in ${closedAfter}`);
        this.emit('finished', { id: this.id });
    };

    _disconnect = () => {
        const closedAfter = new Date() - this.startWSOpen;

        this.ws.close();
        logger.info(`Disconnected ws ${this.id} in ${closedAfter}`);
        this.emit('disconnect', { id: this.id });
    };

    _error = e => {
        const errorAfter = new Date() - this.startWSOpen;

        logger.info(`Failed ws ${this.id}, error %o in ${errorAfter}`, e);
        this.emit('finished', { id: this.id });
    };
}


/**
 *
 */
class TestCheckRouter {
    /**
     *
     * @param {*} appServer
     */
    constructor(appServer) {
        this.testCheckMap = {};
        this.disconnected = false;

        appServer.workerPool.on(ResponseType.DONE, body => {
            this.routeDoneResponse(body);
        });

        appServer.workerPool.on(ResponseType.METRICS, body => {
            this.routeMetricsResponse(body);
        });

        appServer.workerPool.on(ResponseType.ERROR, body => {
            this.routeErrorResponse(body);
        });
    }

    /**
     *
     * @param {*} responseBody
     */
    checkResponseFormat(responseBody) {
        assert('clientId' in responseBody.dumpInfo);
        assert(responseBody.dumpInfo.clientId in this.testCheckMap);
    }

    /**
     *
     * @param {*} body
     */
    routeDoneResponse(body) {
        this.checkResponseFormat(body);
        this.testCheckMap[body.dumpInfo.clientId].checkDoneResponse(body);
        logger.info('routeDoneResponse');
    }

    /**
     *
     * @param {*} body
     */
    routeErrorResponse(body) {
        this.checkResponseFormat(body);
        this.testCheckMap[body.dumpInfo.clientId].checkErrorResponse(body);
    }

    /**
     *
     * @param {*} body
     */
    routeMetricsResponse(body) {
        this.checkResponseFormat(body);
        this.testCheckMap[body.dumpInfo.clientId].checkMetricsResponse(body);
    }

    /**
     *
     * @param {*} testCheck
     */
    attachTest(testCheck) {
        // Make sure that the test object contains at least the statsSessionId key so we can route results to their
        // appropriate tests.
        assert('statsSessionId' in testCheck);

        this.testCheckMap[testCheck.statsSessionId] = testCheck;
    }
}

/**
 *
 * @param {*} server
 */
function checkTestCompletion(appServer) {

    if (appServer.PromCollector.processed.get().values[0].value === 4) {
        appServer.stop();
    } else {
        setTimeout(checkTestCompletion, 8000, appServer);
    }
}

/**
 *
 * @param {*} file
 * @param {*} dumpPath
 * @param {*} resultPath
 * @param {*} ua
 * @param {*} protocolV
 */
function simulateConnection(file, resultFile, ua, protocolV) {
    const filePath = dumpPath + file;
    const resultPath = jestResultsPath + resultFile;

    this.disconnected = false;
    const resultString = fs.readFileSync(resultPath);

    const resultList = JSON.parse(resultString);
    const resultTemplate = resultList.shift();
    const statsSessionId = uuidV4();

    const wsOptions = {
        headers: {
            'User-Agent': ua
        },
        origin: 'localhost'
    };

    const rtcstatsWsOptions = {
        id: file,
        serverUrl: `ws://localhost:3000/?statsSessionId=${statsSessionId}`,
        filePath,
        readDelay: 1,
        wsOptions,
        protocolV,
        statsSessionId
    };

    const connection = new RtcstatsConnection(rtcstatsWsOptions);

    testCheckRouter.attachTest({
        statsSessionId,
        checkDoneResponse: body => {
            const parsedBody = JSON.parse(JSON.stringify(body));

            resultList.shift();
            resultTemplate.dumpInfo.clientId = statsSessionId;
            resultTemplate.dumpInfo.dumpPath = body.dumpInfo.dumpPath;
            resultTemplate.dumpInfo.endDate = body.dumpInfo.endDate;
            resultTemplate.dumpInfo.startDate = body.dumpInfo.startDate;

            // The size of the dump changes with every iteration as the application will add an additional
            // 'connectionInfo' entry, thus metrics won't match.
            delete parsedBody.features?.metrics;
            delete resultTemplate.features?.metrics;
            delete parsedBody.features?.browserInfo;
            delete resultTemplate.features?.browserInfo;

            assert.deepStrictEqual(parsedBody, resultTemplate);
        },
        checkErrorResponse: body => {
            throw Error(`[TEST] Processing failed with:| ${JSON.stringify(body)} |`);
        },
        checkMetricsResponse: body => {
            logger.info('[TEST] Handling METRICS event with body %j', body);

            // assert.fail(body.extractDurationMs < 400);
        }
    });

    connection.connect();
    connection.on('disconnect', () => {
        this.disconnected = true;

        // we need to wait a little bit before reconnecting.
        setTimeout(() => {
            connection.connect();
        }, 500);
    });
}

/**
 *
 */
function runTest() {
    testCheckRouter = new TestCheckRouter(server);

    simulateConnection(
        'google-standard-stats-p2p-reconnect',
        'google-standard-stats-p2p-result.json',
        BrowserUASamples.CHROME,
        ProtocolV.STANDARD
    );

    simulateConnection(
        'google-standard-stats-p2p',
        'google-standard-stats-p2p-result.json',
        BrowserUASamples.CHROME,
        ProtocolV.STANDARD
    );

    simulateConnection(
        'google-standard-stats-sfu',
        'google-standard-stats-sfu-result.json',
        BrowserUASamples.CHROME,
        ProtocolV.STANDARD
    );

    simulateConnection(
        'firefox-standard-stats-sfu',
        'firefox-standard-stats-sfu-result.json',
        BrowserUASamples.FIREFOX,
        ProtocolV.STANDARD
    );

    // simulateConnection(
    //     'firefox97-standard-stats-sfu',
    //     'firefox97-standard-stats-sfu-result.json',
    //     BrowserUASamples.FIREFOX,
    //     ProtocolV.STANDARD
    // );

    // simulateConnection(
    //     'safari-standard-stats',
    //     'safari-standard-stats-result.json',
    //     BrowserUASamples.SAFARI,
    //     ProtocolV.STANDARD
    // );

    // simulateConnection(
    //     'chrome96-standard-stats-p2p-add-transceiver',
    //     'chrome96-standard-stats-p2p-add-transceiver-result.json',
    //     BrowserUASamples.CHROME,
    //     ProtocolV.STANDARD
    // );
}

setTimeout(runTest, 6000);

checkTestCompletion(server);
