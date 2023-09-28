/* eslint-disable no-undef */
/* eslint-disable max-len */
const { getStatsFormat, StatsFormat } = require('../../utils/stats-detection');
const { getUrlParameter, addProtocol } = require('../../utils/utils');

describe('getStatsFormat', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns CHROME_STANDARD for Chrome user agents with standard stats format', () => {
        const clientMeta = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
            clientProtocol: '3_STANDARD'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.CHROME_STANDARD);
    });

    it('returns CHROME_LEGACY for Chrome user agents with legacy stats format', () => {
        const clientMeta = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
            clientProtocol: '3_LEGACY'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.CHROME_LEGACY);
    });

    it('returns FIREFOX for firefox user agents', () => {
        const clientMeta = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:74.0) Gecko/20100101 Firefox/74.0'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.FIREFOX);
    });

    it('returns SAFARI for safari user agents', () => {
        const clientMeta = {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.1 Safari/605.1.15'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.SAFARI);
    });

    it('returns CHROME_LEGACY for a missing protocol field', () => {
        const clientMeta = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.CHROME_LEGACY);
    });

    it('returns CHROME_LEGACY for a empty client protocol field', () => {
        const clientMeta = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
            clientProtocol: ''
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.CHROME_LEGACY);
    });

    it('returns UNSUPPORTED when clientMeta does not contain userAgent', () => {
        const clientMeta = {};
        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.UNSUPPORTED);
    });

    it('returns UNSUPPORTED for a empty user agent field', () => {
        const clientMeta = {
            userAgent: '',
            clientProtocol: '3_LEGACY'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.UNSUPPORTED);
    });

    it('returns UNSUPPORTED for a missing user agent field', () => {
        const clientMeta = {
            clientProtocol: '3_LEGACY'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.UNSUPPORTED);
    });

    it('returns UNSUPPORTED for unsupported user agents', () => {
        const clientMeta = {
            userAgent: 'Some unsupported browser'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.UNSUPPORTED);
    });

    it('returns CHROME_STANDARD for electron user agents', () => {
        const clientMeta = {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) CoScreen/6.1.34 Chrome/114.0.5735.248 Electron/25.3.2 Safari/537.36'
        };

        const result = getStatsFormat(clientMeta);

        expect(result).toBe(StatsFormat.CHROME_STANDARD);

        const clientMeta2 = {
            userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) electron/1.0.0 Chrome/53.0.2785.113 Electron/1.4.3 Safari/537.36'
        };

        const result2 = getStatsFormat(clientMeta2);

        expect(result2).toBe(StatsFormat.CHROME_STANDARD);
    });
});

describe('getUrlParameter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns parameter value for an expected url format', () => {
        const sessionId = 'random-session-id';
        const clientMeta = `https://8x8.vc/testconference?statsSessionId=${sessionId}`;

        const result = getUrlParameter('statsSessionId', clientMeta);

        expect(result).toBe(sessionId);
    });

    it('returns parameter value for an expected url format with trailing slashes', () => {
        const sessionId = 'random-session-id';
        const clientMeta = `https://////8x8.vc//////testconference?statsSessionId=${sessionId}`;

        const result = getUrlParameter('statsSessionId', clientMeta);

        expect(result).toBe(sessionId);
    });

    it('returns null if the parameter is not found', () => {
        const sessionId = 'random-session-id';
        const clientMeta = `https://8x8.vc/testconference?statsSessionId=${sessionId}`;

        const result = getUrlParameter('not-session-id', clientMeta);

        expect(result).toBe(null);
    });

    it('returns parameter value for url without protocol', () => {
        const sessionId = 'random-session-id';
        const clientMeta = `8x8.vc/testconference?statsSessionId=${sessionId}`;

        const result = getUrlParameter('statsSessionId', clientMeta);

        expect(result).toBe(sessionId);
    });

    it('returns parameter value for url without protocol', () => {
        expect(() => getUrlParameter('not-session-id', null)).toThrow('Invalid URL');
    });
});


describe('addProtocol', () => {
    test('adds http:// to URL without a protocol', () => {
        const url = '8x8.vc/testconference?statsSessionId=aaaa-1111';

        expect(addProtocol(url)).toBe(`https://${url}`);
    });

    test('does not add protocol to URL with existing http protocol', () => {
        const url = 'http://example.com';

        expect(addProtocol(url)).toBe('http://example.com');
    });

    test('does not add protocol to URL with existing https protocol', () => {
        const url = 'https://example.com';

        expect(addProtocol(url)).toBe('https://example.com');
    });

    test('returns input URL if input is not a string', () => {
        expect(addProtocol(123)).toBe('https://123');
        expect(addProtocol(null)).toBe(null);
        expect(addProtocol(undefined)).toBe(undefined);
    });
});
