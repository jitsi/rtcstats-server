const { ConnectionInformation, ClientType } = require('../../utils/ConnectionInformation');
const { StatsFormat } = require('../../utils/stats-detection');

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36';
const FIREFOX_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0';
const SAFARI_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko)'
    + ' Version/14.0 Safari/605.1.15';
const NODE_USER_AGENT = 'Node.js';


describe('ConnectionInformation', () => {

    test('should construct with correct JICOFO details', () => {
        const clientProtocol = '1.0_JICOFO';
        const origin = 'http://localhost';
        const userAgent = 'test-agent';
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getDetails()).toEqual({
            path: urlPath,
            origin,
            url: origin + urlPath,
            userAgent,
            clientProtocol,
            statsFormat: StatsFormat.UNSUPPORTED,
            clientType: ClientType.JICOFO
        });
    });

    test('should construct with correct JVB details', () => {
        const clientProtocol = '3.0_JVB';
        const origin = 'http://localhost';
        const userAgent = 'test-agent';
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getDetails()).toEqual({
            path: urlPath,
            origin,
            url: origin + urlPath,
            userAgent,
            clientProtocol,
            statsFormat: StatsFormat.UNSUPPORTED,
            clientType: ClientType.JVB
        });
    });

    test('should construct with correct JIGASI details', () => {
        const clientProtocol = '1.0_JIGASI';
        const origin = 'http://localhost';
        const userAgent = 'test-agent';
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getDetails()).toEqual({
            path: urlPath,
            origin,
            url: origin + urlPath,
            userAgent,
            clientProtocol,
            statsFormat: StatsFormat.UNSUPPORTED,
            clientType: ClientType.JIGASI
        });

    });

    test('should construct with correct RTCSTATS details', () => {
        const clientProtocol = '3.1_STANDARD';
        const origin = 'http://localhost';
        const userAgent = 'test-agent';
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getDetails()).toEqual({
            path: urlPath,
            origin,
            url: origin + urlPath,
            userAgent,
            clientProtocol,
            statsFormat: StatsFormat.UNSUPPORTED,
            clientType: ClientType.RTCSTATS
        });
    });

    test('should construct with correct unsupported details', () => {
        const clientProtocol = 'unsupported';
        const origin = 'http://localhost';
        const userAgent = 'test-agent';
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getDetails()).toEqual({
            path: urlPath,
            origin,
            url: origin + urlPath,
            userAgent,
            clientProtocol,
            statsFormat: StatsFormat.UNSUPPORTED,
            clientType: ClientType.UNSUPPORTED
        });
    });

    test('should construct with correct JIBRI details', () => {
        const clientProtocol = '1.0_JIBRI';
        const origin = 'http://localhost';
        const userAgent = 'test-agent';
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getDetails()).toEqual({
            path: urlPath,
            origin,
            url: origin + urlPath,
            userAgent,
            clientProtocol,
            statsFormat: StatsFormat.UNSUPPORTED,
            clientType: ClientType.JIBRI
        });
    });

    test('should construct with correct stats format type', () => {
        const clientProtocol = '3.1_STANDARD';
        const origin = 'http://localhost';
        const userAgent = CHROME_USER_AGENT;
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getStatsFormat()).toBe(StatsFormat.CHROME_STANDARD);
    });

    test('should construct with correct stats format type for firefox', () => {
        const clientProtocol = '3.1_STANDARD';
        const origin = 'http://localhost';
        const userAgent = FIREFOX_USER_AGENT;
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getStatsFormat()).toBe(StatsFormat.FIREFOX);
    });

    test('should construct with correct stats format type for safari', () => {
        const clientProtocol = '3.1_STANDARD';
        const origin = 'http://localhost';
        const userAgent = SAFARI_USER_AGENT;
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getStatsFormat()).toBe(StatsFormat.SAFARI);
    });

    test('should construct with correct stats format type for node', () => {
        const clientProtocol = '3.1_STANDARD';
        const origin = 'http://localhost';
        const userAgent = NODE_USER_AGENT;
        const urlPath = '/test';

        const clientManager = new ConnectionInformation({
            origin,
            userAgent,
            urlPath,
            clientProtocol
        });

        expect(clientManager.getStatsFormat()).toBe(StatsFormat.UNSUPPORTED);
    });
});
