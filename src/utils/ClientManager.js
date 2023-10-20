const { getStatsFormat } = require('./stats-detection');

const ClientType = Object.freeze({
    JVB: 'JVB_CLIENT',
    JICOFO: 'JICOFO_CLIENT',
    JIBRI: 'JIBRI_CLIENT',
    JIGASI: 'JIGASI_CLIENT',
    RTCSTATS: 'RTCSTATS_CLIENT',
    UNSUPPORTED: 'UNSUPPORTED_CLIENT'
});

/**
 * Class that manages the connected clients.
 */
class ClientManager {

    /**
     * Create a ClientManager object.
     * @param {WebSocket} client - The WebSocket client.
     * @param {http.IncomingMessage} upgradeRequest - The HTTP upgrade request.
     */
    constructor(client, upgradeRequest) {

        // the url the client is coming from
        const { headers: { origin = '', 'user-agent': userAgent = '' } = { }, url = '' } = upgradeRequest;
        const { protocol: clientProtocol = '' } = client;
        const referer = origin + url;
        const statsFormat = getStatsFormat({ userAgent,
            clientProtocol });
        const clientType = this.extractClientType(clientProtocol);

        // During feature extraction we need information about the browser in order to decide which algorithms use.
        this.clientDetails = {
            path: url,
            origin,
            url: referer,
            userAgent,
            clientProtocol,
            statsFormat,
            clientType
        };
    }

    /**
     * Get the connection details.
     *
     * @returns {Object} - The connection details.
     */
    getDetails() {
        return this.clientDetails;
    }

    /**
     * Get the statistics format.
     *
     * @returns {string} - The statistics format.
     */
    getStatsFormat() {
        return this.statsFormat;
    }

    /**
     * Get the client type.
     *
     * @returns {string} - The client type.
     */
    getClientType() {
        return this.clientType;
    }

    /**
     * Extract the client type from the client protocol.
     *
     * @param {string} clientProtocol - The string protocol sent by the websocket client.
     * @returns {ClientType} - The client type.
     */
    extractClientType(clientProtocol) {
        let clientType = ClientType.UNSUPPORTED;

        if (clientProtocol?.includes('3.1_STANDARD')) {
            clientType = ClientType.RTCSTATS;
        } else if (clientProtocol?.includes('JIGASI')) {
            clientType = ClientType.JIGASI;
        } else if (clientProtocol?.includes('JICOFO')) {
            clientType = ClientType.JICOFO;
        } else if (clientProtocol?.includes('JIBRI')) {
            clientType = ClientType.JIBRI;
        } else if (clientProtocol?.includes('JVB')) {
            clientType = ClientType.JVB;
        }

        return clientType;
    }

    /**
     * Check if the connected client supports feature extraction.
     *
     * @param {*} clientTypes
     * @returns
     */
    supportsFeatureExtraction() {
        // Currently react native clients are disabled due to some inconsistencies in the stats format.
        return (this.clientDetails?.clientType === ClientType.RTCSTATS) && !this.isReactNativeApp();
    }

    /**
     * Check if the connected client is a React Native app.
     *
     * @returns {boolean} - True if the client is a React Native app.
     */
    isReactNativeApp() {
        return this.clientDetails?.userAgent?.includes('react-native');
    }
}

module.exports = {
    ClientManager,
    ClientType
};
