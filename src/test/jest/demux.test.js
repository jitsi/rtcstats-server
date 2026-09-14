/* eslint-disable no-undef */

const fs = require('fs');
const os = require('os');
const path = require('path');

// PromCollector starts an interval timer when it is loaded, which keeps jest alive.
jest.mock('../../metrics/PromCollector.js', () => {
    return {
        sessionCount: { inc: () => { /* noop */ } },
        requestSizeBytes: { observe: () => { /* noop */ } }
    };
});

jest.mock('../../logging', () => {
    return {
        debug: () => { /* noop */ },
        info: () => { /* noop */ },
        warn: () => { /* noop */ },
        error: () => { /* noop */ }
    };
});

const DemuxSink = require('../../demux');
const { ConnectionInformation } = require('../../utils/ConnectionInformation');

const logger = {
    debug: () => { /* noop */ },
    info: () => { /* noop */ },
    warn: () => { /* noop */ },
    error: () => { /* noop */ }
};

/**
 * Create a DemuxSink that writes to the given folder.
 *
 * @param {string} dumpFolder - Folder for the dump files.
 * @returns {DemuxSink} - The sink.
 */
function createDemuxSink(dumpFolder) {
    const connectionInformation = new ConnectionInformation({
        origin: 'https://example.com',
        userAgent: 'jest',
        urlPath: '/',
        clientProtocol: '3.1_STANDARD'
    });

    return new DemuxSink({
        dumpFolder,
        connectionInformation,
        log: logger
    });
}

describe('DemuxSink statsSessionId validation', () => {
    let dumpFolder;
    let demuxSink;

    beforeEach(() => {
        dumpFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcstats-demux-test-'));
        demuxSink = createDemuxSink(dumpFolder);
    });

    afterEach(() => {
        demuxSink._clearState();
        fs.rmSync(dumpFolder, {
            recursive: true,
            force: true
        });
    });

    it('should create a dump file for a valid statsSessionId', async () => {
        await demuxSink._handleRequest({
            statsSessionId: 'abc123',
            type: 'identity',
            data: {}
        });

        expect(fs.readdirSync(dumpFolder)).toEqual([ 'abc123' ]);
    });

    it.each([
        [ 'parent directory segments', '../../../../tmp/rtcstats-test-id' ],
        [ 'absolute path', '/tmp/rtcstats-test-id' ],
        [ 'nested path', 'sub/rtcstats-test-id' ],
        [ 'leading dot segment', './rtcstats-test-id' ],
        [ 'non string', 1234 ]
    ])('should reject a %s statsSessionId and not create a file', async (name, statsSessionId) => {
        await expect(demuxSink._handleRequest({
            statsSessionId,
            type: 'identity',
            data: {}
        })).rejects.toThrow(/invalid characters/);

        expect(fs.readdirSync(dumpFolder)).toEqual([]);
    });
});
