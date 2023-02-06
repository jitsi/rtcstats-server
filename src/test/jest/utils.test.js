/* eslint-disable no-undef */
/* eslint-disable max-len */
const { getStatsFormat, StatsFormat } = require('../../utils/stats-detection');

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
});
