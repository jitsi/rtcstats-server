/* feature extraction utils */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const logger = require('../logging');

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

    return { kind,
        trackId,
        streamId };
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

        tracks.push({ kind,
            trackId });
    });

    return { streamId,
        tracks };
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
                tracks.set(`${direction}:${trackId}`, { kind,
                    streamId,
                    trackId,
                    direction,
                    stats: [] });
            });
        } else if (type === 'addTrack' || type === 'ontrack') {
            const direction = type === 'addTrack' ? 'send' : 'recv';
            const { kind, trackId, streamId } = extractFromTrackFormat(value);

            tracks.set(`${direction}:${trackId}`, { kind,
                streamId,
                trackId,
                direction,
                stats: [] });
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
                    } else if (trackIdentifier !== undefined) {
                        logger.debug('NO ONTRACK FOR', trackIdentifier, report.ssrc);
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
 *
 * @param {*} lastLine
 */
function parseLineForSequenceNumber(lastLine) {
    const jsonData = JSON.parse(lastLine);

    logger.debug('[ClientMessageHandler] Last sequence number from line: ', lastLine);
    if (Array.isArray(jsonData) && jsonData[4] !== undefined) {
        logger.debug('[ClientMessageHandler] Last sequence number from dump: ', jsonData[4]);

        return jsonData[4];
    }

    return -1;
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

    const [ , urlFirstPart, ...confPath ] = conferenceUrl.split('/');

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
 *
 * @param {*} tempPath
 * @param {*} statsSessionId
 * @returns
 */
function getDumpPath(tempPath, statsSessionId) {
    return `${tempPath}/${statsSessionId}`;
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

module.exports = {
    average,
    capitalize,
    asyncDeleteFile,
    extractTracks,
    extractStreams,
    extractTenantDataFromUrl,
    fixedDecMean,
    getEnvName,
    getIdealWorkerCount,
    getSecondsSinceEpoch,
    isConnectionSuccessful,
    isIceDisconnected,
    isIceFailed,
    isProduction,
    mode,
    percentOf,
    round,
    RequestType,
    ResponseType,
    standardizedMoment,
    timeBetween,
    uuidV4,
    getSQLTimestamp,
    isObject,
    getDumpPath,
    addPKCS8ContainerAndNewLine,
    obfuscatePII,
    parseLineForSequenceNumber
};
