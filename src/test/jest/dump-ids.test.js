/* eslint-disable no-undef */
const { decompress } = require('../../utils/getstats-deltacompression');
const DumpFileProcessor = require('../../worker-pool/DumpFileProcessor');

// Identifiers in a dump (peer connection ids, report ids, ssrcs, endpoint ids, request types) are used as
// object keys. A name such as `__proto__` or `toString` is the name of a property that a plain object inherits.
// These tests check that an entry with such a name adds no property to a built-in object or function, causes
// no error, and does not stop the collection of the valid data in the same dump.
const builtinNames = [ '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf' ];

// The built-in objects and functions that the tests watch for new properties.
const watched = [ ...new Set([
    Object,
    Object.prototype,
    Array.prototype,
    String.prototype,
    Number.prototype,
    Array.prototype.slice,
    String.prototype.trim,
    Number.prototype.toFixed,
    ...Object.getOwnPropertyNames(Object.prototype)
        .filter(name => name !== '__proto__')
        .map(name => Object.prototype[name])
        .filter(value => typeof value === 'function')
]) ];
let ownNamesBefore;

/**
 * @returns {Array<string>} - The property names that were added to the watched built-ins after the test started.
 */
function addedNames() {
    return watched.flatMap(
        (builtin, i) => Object.getOwnPropertyNames(builtin).filter(name => !ownNamesBefore[i].includes(name)));
}

/**
 * @param {string} clientProtocol - The protocol of the client, which selects the feature extractor.
 * @returns {string} - The connectionInfo line that starts a dump.
 */
function connectionInfoLine(clientProtocol) {
    return JSON.stringify([ 'connectionInfo', null, JSON.stringify({
        path: '/room',
        origin: 'https://example.test',
        url: 'https://example.test/room',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
            + 'Chrome/140.0.0.0 Safari/537.36',
        clientProtocol,
        statsFormat: 'chrome_standard',
        clientType: 'RTCSTATS_CLIENT'
    }), 1 ]);
}

/**
 * Feeds dump lines to `processEntry` of a DumpFileProcessor, one call for each line, as `processStatsFile` does.
 * The line size is `line.length`, which is not the size that `processStatsFile` passes.
 *
 * @param {Array<string>} lines - Dump lines, without the connectionInfo header.
 * @param {string} clientProtocol - The protocol of the client.
 * @returns {Object} - The messages of the errors that the lines caused, and the feature extractor.
 */
function processLines(lines, clientProtocol = '3.1_STANDARD') {
    const processor = new DumpFileProcessor({ dumpPath: 'unused',
        clientId: 'dump-ids-test' });
    const errors = [];

    for (const line of [ connectionInfoLine(clientProtocol), ...lines ]) {
        try {
            processor.processEntry(line, line.length);
        } catch (e) {
            errors.push(e.message);
        }
    }

    return { errors,
        extractor: processor.featureExtractor };
}

beforeEach(() => {
    ownNamesBefore = watched.map(builtin => Object.getOwnPropertyNames(builtin));
});

afterEach(() => {
    // Keep the tests independent: remove what a failed test added.
    watched.forEach((builtin, i) => {
        Object.getOwnPropertyNames(builtin)
            .filter(name => !ownNamesBefore[i].includes(name))
            .forEach(name => delete builtin[name]);
    });
});

describe('decompress', () => {
    it.each(builtinNames)('ignores the report id %s', name => {
        const delta = JSON.parse(`{"${name}":{"added":1},"a":{"x":2},"timestamp":9}`);
        const result = decompress({ a: { x: 1,
            timestamp: 5 } }, delta);

        expect(addedNames()).toEqual([]);
        expect(Object.keys(result)).toEqual([ 'a' ]);
        expect(result.a.x).toBe(2);
    });

    it.each(builtinNames)(
        'removes the report %s from the base when the delta does not have it', name => {
            const result = decompress({ [name]: { x: 1 },
                a: { x: 1,
                    timestamp: 5 } }, { a: { x: 2 } });

            expect(Object.keys(result)).toEqual([ 'a' ]);
        });
});

describe.each(builtinNames)('dump entry with the identifier %s', name => {
    it('as the report id in a delta compressed getstats entry', () => {
        const { errors, extractor } = processLines([
            '["getstats","PC_0",{"a":{"type":"x","bytes":1,"timestamp":0},"timestamp":1},2]',
            `["getstats","PC_0",{"${name}":{"added":1},"a":{"bytes":2},"timestamp":3},4]`
        ]);

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);
        expect(Object.keys(extractor.baseStats.PC_0)).toEqual([ 'a' ]);
        expect(extractor.baseStats.PC_0.a.bytes).toBe(2);
    });

    it('as the report id in the first getstats entry of a peer connection', () => {
        const { errors, extractor } = processLines([
            `["getstats","PC_0",{"${name}":{"v":1},"a":{"v":1}},1]`,
            `["getstats","PC_0",{"${name}":{"v":2},"a":{"v":2}},2]`
        ]);

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);

        // The first entry is the base. The base must not keep a report that a later delta cannot update.
        expect(Object.keys(extractor.baseStats.PC_0)).toEqual([ 'a' ]);
        expect(extractor.baseStats.PC_0.a.v).toBe(2);
    });

    it('as the peer connection id of a getstats entry', () => {
        const { errors, extractor } = processLines([
            '["getstats","PC_0",{"a":{"type":"x","timestamp":0},"timestamp":1},100]',
            `["getstats","${name}",{"added":{"any":"value"},"timestamp":1},999999]`
        ]);

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);
        expect(Object.keys(extractor.collector.getProcessedStats())).toEqual([ 'PC_0' ]);

        // The entry is dropped as a whole: it does not count in the metrics or in the session duration.
        expect(extractor.features.metrics.statsRequestCount).toBe(1);
        expect(extractor.features.sessionEndTime).toBe(100);
    });

    it.each([
        [ 'createOfferOnFailure', '"error"' ],
        [ 'setRemoteDescriptionOnFailure', '"error"' ],
        [ 'onconnectionstatechange', '"connected"' ],
        [ 'oniceconnectionstatechange', '"connected"' ],
        [ 'ondtlserror', '{}' ],
        [ 'ondtlsstatechange', '"failed"' ],
        [ 'onicecandidateerror', '{"errorCode":701}' ]
    ])('as the peer connection id of a %s entry', (type, data) => {
        const { errors, extractor } = processLines([ `["${type}","${name}",${data},2]` ]);

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);
        expect(Object.keys(extractor.collector.getProcessedStats())).toEqual([]);
    });

    it('as the endpoint id of a dominantSpeaker entry', () => {
        const { errors, extractor } = processLines([
            '["dominantSpeaker",null,{"dominantSpeakerEndpoint":"abcd1234"},100]',
            `["dominantSpeaker",null,{"dominantSpeakerEndpoint":"${name}"},200]`,
            '["dominantSpeaker",null,{"dominantSpeakerEndpoint":"ffff0000"},300]'
        ]);
        const { speakerStats } = extractor.dominantSpeakerData;

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);

        // The dominant speaker does not change, so the speaker before the entry keeps the time.
        expect(Object.keys(speakerStats)).toEqual([ 'abcd1234', 'ffff0000' ]);
        expect(speakerStats.abcd1234.speakerTime).toBe(200);
    });

    it('as the endpoint id of the session, with another endpoint as the dominant speaker', () => {
        const { errors, extractor } = processLines([
            `["identity",null,{"endpointId":"${name}"},1]`,
            '["dominantSpeaker",null,{"dominantSpeakerEndpoint":"abcd1234"},100]'
        ]);

        extractor.extractDominantSpeakerFeatures();

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);

        // The session has no speaker stats of its own, so the features keep their initial values.
        expect(extractor.features.dominantSpeakerChanges).toBe(0);
        expect(extractor.features.speakerTime).toBe(0);
    });

    it('as the ssrc of a report in a getstats entry', () => {
        const { errors, extractor } = processLines([
            `["getstats","PC_0",{"out":{"type":"outbound-rtp","kind":"video","ssrc":"${name}","packetsSent":5,`
                + `"timestamp":1},"in":{"type":"inbound-rtp","kind":"audio","ssrc":"${name}","packetsReceived":5,`
                + '"timestamp":1},"valid":{"type":"outbound-rtp","kind":"video","ssrc":111,"packetsSent":7,'
                + '"timestamp":1}},2]'
        ]);
        const pcData = extractor.collector.getProcessedStats().PC_0;

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);
        expect(Object.hasOwn(pcData, name)).toBe(false);
        expect(pcData['111'].packetsSent).toEqual([ 7 ]);
    });

    it('as the ssrc of a setVideoType entry', () => {
        const { errors, extractor } = processLines([
            '["create","PC_0",{},1]',
            `["setVideoType",null,{"ssrc":"${name}","videoType":"camera"},2]`,
            '["setVideoType",null,{"ssrc":222,"videoType":"desktop"},3]'
        ]);
        const pcData = extractor.collector.getProcessedStats().PC_0;

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);
        expect(Object.hasOwn(pcData, name)).toBe(false);
        expect(Object.getPrototypeOf(pcData)).toBe(Object.prototype);
        expect(pcData['222'].videoType).toBe('desktop');
    });

    it('as the endpoint id of an e2eRtt entry', () => {
        const { errors, extractor } = processLines([
            `["e2eRtt",null,{"remoteEndpointId":"${name}","rtt":5,"remoteRegion":"r"},2]`,
            '["e2eRtt",null,{"remoteEndpointId":"abcd1234","rtt":7,"remoteRegion":"r"},3]'
        ]);
        const { e2epings } = extractor.features;

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);
        expect(Object.getPrototypeOf(e2epings)).toBe(Object.prototype);
        expect(e2epings).toEqual({ abcd1234: { remoteRegion: 'r',
            rtt: 7 } });
    });

    it('as the request type', () => {
        const { errors, extractor } = processLines([ `["${name}","PC_0",{},5]` ]);

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);

        // A type with no handler is counted as an "other" request.
        expect(extractor.features.metrics.otherRequestCount).toBe(1);
    });
});

describe('dump entry with the name of an inherited property', () => {
    it.each(builtinNames.filter(name => name !== '__proto__'))('%s as the faceLandmarks value', name => {
        const { errors, extractor } = processLines([
            `["faceLandmarks",null,{"duration":9,"faceLandmarks":"${name}","timestamp":1},2]`,
            '["faceLandmarks",null,{"duration":3,"faceLandmarks":"happy","timestamp":2},3]'
        ]);

        expect(errors).toEqual([]);
        expect(extractor.features.sentiment).toEqual({
            angry: 0,
            disgusted: 0,
            fearful: 0,
            happy: 3,
            neutral: 0,
            sad: 0,
            surprised: 0
        });
    });

    it('__proto__ as the request type of a backend dump', () => {
        const { errors } = processLines([ '{"type":"__proto__","timestamp":5}' ], '3.0_JVB');

        expect(errors).toEqual([]);
    });
});

describe('getstats entry with a stats value that is not an object', () => {
    it.each([
        [ 'an array', '[]', 'slice' ],
        [ 'a string', '"abc"', 'trim' ],
        [ 'a number', '5', 'toFixed' ],
        [ 'null', 'null', 'slice' ]
    ])('%s', (description, value, method) => {
        const { errors, extractor } = processLines([
            `["getstats","PC_0",${value},1]`,
            `["getstats","PC_0",{"${method}":{"added":1}},2]`,
            `["getstats","PC_0",${value},3]`
        ]);

        expect(addedNames()).toEqual([]);
        expect(errors).toEqual([]);

        // The entries with the wrong type are ignored. The valid entry is the base.
        expect(Object.keys(extractor.baseStats.PC_0)).toEqual([ method ]);
    });
});
