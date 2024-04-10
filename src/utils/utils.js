/* feature extraction utils */
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { URL } = require('url');
const util = require('util');
const { v4: uuidv4 } = require('uuid');

/**
 *
 * @param {*} str
 */
function capitalize(str) {
    return str[0].toUpperCase() + str.substr(1);
}

/**
 * determine mode (most common) element in a series.
 * @param {*} series
 */
function mode(series) {
    const modes = {};

    series.forEach(item => {
        if (!modes[item]) {
            modes[item] = 0;
        }
        modes[item]++;
    });

    let value = -1;
    let max = -1;

    Object.keys(modes).forEach(key => {
        if (modes[key] > max) {
            max = modes[key];
            value = key;
        }
    });

    return value;
}

/**
 * A reducer that computes the average.
 */
function average(accumulator, currentValue, index, array) {
    return accumulator + (currentValue / array.length);
}

/**
 * Round half up ('round half towards positive infinity')
 * Uses exponential notation to avoid floating-point issues.
 * Negative numbers round differently than positive numbers.
 */
function round(num, decimalPlaces) {
    const roundNum = Math.round(`${num}e${decimalPlaces}`);

    return Number(`${roundNum}e${-decimalPlaces}`);
}

/**
 *
 * @param {*} series
 * @param {*} dec
 */
function fixedDecMean(series, dec) {
    const len = series.length || 1;

    const mean = series.reduce((a, b) => a + b, 0) / len;

    return round(mean, dec);
}

/**
 * Calculate standardized moment.
 * order=1: 0
 * order=2: variance
 * order=3: skewness
 * order=4: kurtosis
 * @param {*} series
 * @param {*} order
 */
function standardizedMoment(series, order) {
    const len = series.length || 1;
    const mean = series.reduce((a, b) => a + b, 0) / len;

    return series.reduce((a, b) => a + Math.pow(b - mean, order), 0) / len;
}

/**
 * extracts stream id, track id and kind from the format used in addTrack/ontrack
 * @param {*} value
 */
function extractFromTrackFormat(value) {
    const [ kind, trackId ] = value.split(' ')[0].split(':');
    const streamId = value.split(' ')[1].split(':')[1];

    return {
        kind,
        trackId,
        streamId
    };
}

/**
 * extracts stream id, track id and kind from the format used in legacy addStream/onaddstream
 * @param {*} value
 */
function extractFromStreamFormat(value) {
    const [ streamId, trackList ] = value.split(' ');
    const tracks = [];

    trackList.split(',').forEach(id => {
        const [ kind, trackId ] = id.split(':');

        tracks.push({
            kind,
            trackId
        });
    });

    return {
        streamId,
        tracks
    };
}

/**
 * extracts a Map with all local and remote audio/video tracks.
 * @param {*} peerConnectionLog
 */
function extractTracks(peerConnectionLog) {
    const tracks = new Map();

    for (let i = 0; i < peerConnectionLog.length; i++) {
        const { type, value } = peerConnectionLog[i];

        if (type === 'addStream' || type === 'onaddstream') {
            const { streamId, tracks: listOfTracks } = extractFromStreamFormat(value);
            const direction = type === 'addStream' ? 'send' : 'recv';

            listOfTracks.forEach(({ kind, trackId }) => {
                tracks.set(`${direction}:${trackId}`, {
                    kind,
                    streamId,
                    trackId,
                    direction,
                    stats: []
                });
            });
        } else if (type === 'addTrack' || type === 'ontrack') {
            const direction = type === 'addTrack' ? 'send' : 'recv';
            const { kind, trackId, streamId } = extractFromTrackFormat(value);

            tracks.set(`${direction}:${trackId}`, {
                kind,
                streamId,
                trackId,
                direction,
                stats: []
            });
        } else if (type === 'getStats') {
            Object.keys(value).forEach(id => {
                const report = value[id];

                if (report.type === 'ssrc') {
                    const { trackIdentifier } = report;
                    const direction = id.endsWith('_recv') ? 'recv' : 'send';
                    const key = `${direction}:${trackIdentifier}`;

                    if (tracks.has(key)) {
                        if (report.timestamp) {
                            report.timestamp = new Date(report.timestamp);
                        } else {
                            report.timestamp = peerConnectionLog[i].time;
                        }
                        const currentStats = tracks.get(key).stats;
                        const lastStat = currentStats[currentStats.length - 1];

                        if (!lastStat || report.timestamp.getTime() - lastStat.timestamp.getTime() > 0) {
                            tracks.get(key).stats.push(report);
                        }
                    }
                }
            });
        }
    }

    return tracks;
}

/**
 *
 * @param {*} logs
 * @param {*} startEvents
 * @param {*} endEvents
 */
function timeBetween(logs, startEvents, endEvents) {
    let first;

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];

        if (startEvents.includes(log.type)) {
            first = log;
        } else if (endEvents.includes(log.type)) {
            if (first) {
                return log.timestamp - first.timestamp;
            }

            return -1;

        }
    }
}

/**
 *
 * @param {*} tracks
 */
function extractStreams(tracks) {
    const streams = new Map();

    for (const [ trackId, { streamId } ] of tracks.entries()) {
        if (streams.has(streamId)) {
            streams.get(streamId).push(tracks.get(trackId));
        } else {
            streams.set(streamId, [ tracks.get(trackId) ]);
        }
    }

    return streams;
}

/**
 *
 * @param {*} percent
 * @param {*} whole
 */
function percentOf(percent, whole) {
    // If the number we extract the percentage from is 0, the operation doesn't make a lot of sense
    // return undefined for consistency.
    if (!whole) {
        return undefined;
    }

    return round((percent / whole) * 100, 2);
}

/**
 * Verify if the connection (iceconnectionstate or connectionstate) was successful.
 *
 * @param {string} value - state of the ice connection
 */
function isConnectionSuccessful(value) {
    return [ 'connected', 'completed' ].includes(value);
}

/**
 * Verify if the ICE connection state was disconnected.
 *
 * @param {string} value - state of the ice connection
 */
function isIceDisconnected(value) {
    return [ 'disconnected' ].includes(value);
}

/**
 * Verify if the ICE connection state was failed.
 *
 * @param {string} value - state of the ice connection
 */
function isIceFailed(value) {
    return [ 'failed' ].includes(value);
}

/**
 *
 */
function getEnvName() {
    return process.env.NODE_ENV || 'default';
}

/**
 *
 */
function isProduction() {
    return getEnvName() === 'production';
}

/**
 *
 * @param {*} filePath
 */
async function asyncDeleteFile(filePath) {
    await fs.promises.unlink(filePath);
}

/**
 * Generate uuid v4
 *
 * @returns {string}
 */
function uuidV4() {
    return uuidv4();
}

/**
 *  Using all the CPUs available might slow down the main node.js thread which is responsible for handling
 *  requests.
 */
function getIdealWorkerCount() {

    if (os.cpus().length <= 2) {
        return 1;
    }

    return os.cpus().length - 2;
}

/**
 * Get a SQL compliant timestamp (MDY DateStyle)
 * Time value or timestamp number
 * @param {number} value - An integer value representing the number of milliseconds since January 1, 1970, 00:00:00 UTC
 * (the ECMAScript epoch, equivalent to the UNIX epoch), with leap seconds ignored.
 * @returns a datetime (in the UTC timezone) that is suitable for use in SQL/Firehose.
 */
function getSQLTimestamp(value) {
    const date = value ? new Date(value) : new Date();


    // the timezone is always zero UTC offset, as denoted by the suffix Z (that we slice)
    return date.toISOString()
        .slice(0, 19)
        .replace('T', ' ');
}

/**
 * Self explanatory
 *
 * @returns {number}
 */
function getSecondsSinceEpoch() {

    return Math.floor(Date.now() / 1000);
}

/**
 * Node.js signing libraries expect a properly formatted PKCS8 private key.
 * Adds new line and PKCS8 container to a unformatted PEM PKCS8( base64 + PKCS8 header) encoded private key.
 *
 * @param {string} unformattedPKCS8 - Unformatted (no 64 char new line and envelop) base64 private key;
 * @returns {string} - Properly formatted PKCS8 PEM key.
 */
function addPKCS8ContainerAndNewLine(unformattedPKCS8) {
    const formattedPKCS8 = unformattedPKCS8.replace(/(.{64})/g, '$1\n');

    return `-----BEGIN PRIVATE KEY-----\n${formattedPKCS8}\n-----END PRIVATE KEY-----`;
}

const VPAAS_TENANT_PREFIX = 'vpaas-magic-cookie-';

/**
 * Extract JaaS client information from conference url.
 *
 * @param {string} conferenceUrl - Conference url without transport information (https etc.)
 * @returns {Object}
 */
function extractTenantDataFromUrl(conferenceUrl = '') {

    const noProtoConferenceUrl = conferenceUrl.replace(/(^\w+:|^)\/\//, '');

    const [ , urlFirstPart, ...confPath ] = noProtoConferenceUrl.split('/');

    let tenant = '';
    let jaasClientId = '';
    let jaasMeetingFqn = '';
    let isJaaSTenant = false;

    if (urlFirstPart && urlFirstPart.startsWith(VPAAS_TENANT_PREFIX)) {
        tenant = urlFirstPart;
        jaasMeetingFqn = path.join(urlFirstPart, ...confPath);
        jaasClientId = urlFirstPart.replace(VPAAS_TENANT_PREFIX, '');
        isJaaSTenant = true;
    }

    return {
        tenant,
        jaasMeetingFqn,
        jaasClientId,
        isJaaSTenant
    };
}

/**
 * Obfuscate data that contains personal identifiable information
 *
 * @param {*} piiObject - object containing PII
 */
function obfuscatePII(piiObject) {
    // eslint-disable-next-line no-unused-vars
    const { userId, ...piiSafeObj } = piiObject;

    return piiSafeObj;
}

/**
 * Checks wheather or not the passed in variable is an Object.
 */
function isObject(input) {
    return typeof input === 'object' && !Array.isArray(input) && input !== null;
}

/**
 * Adds the "https://" protocol to a URL if it does not have a protocol already.
 *
 * @param {string} url - The URL to be modified.
 * @returns {string} The modified URL
 */
function addProtocol(url) {
    if (url && !/^https?:\/\//i.test(url)) {
        return `https://${url}`;
    }

    return url;
}

/**
 * Retrieves the value of a specific parameter from a URL string. The URL definition
 * is a bit more permissive in this case, as we accept urls without the protocol prefix.
 *
 * @param {string} paramName - The name of the parameter to retrieve
 * @param {string} urlStr - The URL string to extract the parameter from
 * @returns {?string} - The value of the parameter if found, or null if not found
 */
function getUrlParameter(paramName, urlStr) {
    // JVB sends origin header without the protocol prefix, so we just manually add it
    // if we don't new URL will throw.
    const formattedUrl = addProtocol(urlStr);
    const urlObj = new URL(formattedUrl);
    const searchParams = urlObj.searchParams;

    return searchParams.get(paramName);
}

/**
 * Checks whether a given session is ongoing by checking for the existence of a dump file.
 *
 * @param {string} url - The URL to extract the session ID from
 * @param {string} tempPath - The path to the directory where the dump file is expected to be found
 * @returns {boolean} - true if a dump file exists for the session, false otherwise
 */
function isSessionOngoing(url, tempPath) {

    let isOngoing = false;

    const sessionId = getUrlParameter('statsSessionId', url);

    if (sessionId) {
        const dumpPath = `${tempPath}/${sessionId}`;

        fs.existsSync(dumpPath) && (isOngoing = true);
    }

    return isOngoing;
}

/**
 * Checks if the given URL contains a query parameter 'isReconnect' with value 'true'.
 *
 * @param {string} url - The URL to check.
 * @returns {boolean} Returns `true` if the 'isReconnect' parameter is present and set to 'true',
 * otherwise returns `false`.
 */
function isSessionReconnect(url) {
    return getUrlParameter('isReconnect', url) === 'true';
}

const RequestType = Object.freeze({
    PROCESS: 'PROCESS'
});

const ResponseType = Object.freeze({
    PROCESSING: 'PROCESSING',
    DONE: 'DONE',
    METRICS: 'METRICS',
    ERROR: 'ERROR',
    STATE_UPDATE: 'STATE_UPDATE'
});

/**
 * Get file names from a directory
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function getFileNames(directory) {
    const files = await fsp.readdir(directory);

    return files;
}

/**
 * This is used to ensure that all logs are flushed before the process exits.
 *
 * @param {Object} logger - The logger to flush.
 * @param {number} errorCode - The error code to exit with.
 */
async function exitAfterLogFlush(logger, errorCode = 0) {
    await logger.closeAndFlushLogs();

    consoleLog(`Log file handlers flushed, exiting with ${errorCode}`);

    process.exit(errorCode);
}

/**
 * Logs a message to the console with a prefix to indicate that it's a console log.
 *
 * @param  {...any} args
 */
function consoleLog(...args) {
    const formattedMessage = util.format(...args);

    console.log('[CONSOLE]:', formattedMessage);
}

module.exports = {
    addPKCS8ContainerAndNewLine,
    addProtocol,
    asyncDeleteFile,
    average,
    capitalize,
    consoleLog,
    extractStreams,
    extractTenantDataFromUrl,
    extractTracks,
    exitAfterLogFlush,
    fixedDecMean,
    getEnvName,
    getFileNames,
    getIdealWorkerCount,
    getSecondsSinceEpoch,
    getSQLTimestamp,
    getUrlParameter,
    isConnectionSuccessful,
    isIceDisconnected,
    isIceFailed,
    isObject,
    isProduction,
    isSessionOngoing,
    isSessionReconnect,
    mode,
    obfuscatePII,
    percentOf,
    RequestType,
    ResponseType,
    round,
    standardizedMoment,
    timeBetween,
    uuidV4
};
