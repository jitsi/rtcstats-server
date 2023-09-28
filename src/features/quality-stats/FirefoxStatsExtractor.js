const { getRTTFirefox, getTotalSentPacketsFirefox,
    getTotalReceivedPacketsStandard,
    getInboundVideoSummaryFirefox,
    extractCandidatePairDataFirefox
} = require('../../utils/stats-detection');

/**
 * Collection of functions used to extract data from standard formatted webrtc stats.
 */
class FirefoxStatsExtractor {
    /**
     * Extract round trip time.
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     * @returns {Number|undefined} - Extracted rtt, or undefined if the report isn't of the necessary type.
     */
    extractRtt(statsEntry, report) {
        return getRTTFirefox(statsEntry, report);
    }

    /**
     * Extract data about the selected ice candidate pair.
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     * @returns {Boolean|undefined} - true/false if a TURN server is used/not used in the selected candidate pair, or
     * undefined if the report isn't of the necessary type.
     */
    extractCandidatePairData(statsEntry, report) {
        return extractCandidatePairDataFirefox(statsEntry, report);
    }


    /**
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     */
    // extractJitter(statsEntry, report) {
    //     // TODO
    // }

    /**
     * Extract outbound packet data.
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     * @returns {PacketsSummary|undefined} - Packet summary or undefined if the report isn't of the necessary type.
     */
    extractOutboundPacketLoss(statsEntry, report) {
        return getTotalSentPacketsFirefox(report);
    }

    /**
     * Extract inbound packet data.
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     * @returns {PacketsSummary|undefined} - Packet summary or undefined if the report isn't of the necessary type.
     */
    extractInboundPacketLoss(statsEntry, report) {
        return getTotalReceivedPacketsStandard(statsEntry, report);
    }

    /**
     * Extract the inbound video summary.
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     * @returns {VideoSummary|undefined} - Video summary or undefined if the report isn't of the necessary type.
     */
    extractInboundVideoSummary(statsEntry, report) {
        return getInboundVideoSummaryFirefox(statsEntry, report);
    }

    /**
     * Extract the concealed and received samples - so far not supported by Firefox stats :-(
     *
     * @returns null - As long as this stat is not supported by Firefox.
     */
    extractConcealedSamplesReceived() {
        return null;
    }
}

module.exports = FirefoxStatsExtractor;
