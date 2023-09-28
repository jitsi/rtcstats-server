const {
    extractCandidatePairDataStandard,
    getRTTStandard,
    getTotalReceivedPacketsStandard,
    getConcealedSamplesReceivedStandard,
    getTotalSentPacketsStandard,
    getInboundVideoSummaryStandard
} = require('../../utils/stats-detection');

/**
 * Collection of functions used to extract data from standard formatted webrtc stats.
 */
class StandardStatsExtractor {
    /**
     * Extract round trip time.
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     * @returns {Number|undefined} - Extracted rtt, or undefined if the report isn't of the necessary type.
     */
    extractRtt(statsEntry, report) {
        return getRTTStandard(statsEntry, report);
    }

    /**
     * If the current report is a candidate pair, extract the data.
     *
     * @param {Object} statsEntry - Complete rtcstats entry
     * @param {Object} report - Individual stat report.
     * @returns {Object|undefined} - Object containing candidate pair data.
     */
    extractCandidatePairData(statsEntry, report) {
        return extractCandidatePairDataStandard(statsEntry, report);
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
        return getTotalSentPacketsStandard(statsEntry, report);
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
        return getInboundVideoSummaryStandard(statsEntry, report);
    }

    /**
     * Extract statistics for totalSamplesReceived and concealedSamples.
     *
     * @param {Object} statsEntry - Complete rtcstats entry.
     * @param {Object} report - Individual stat report.
     * @returns {ConcealeadSamplesSummary}
     */
    extractConcealedSamplesReceived(statsEntry, report) {
        return getConcealedSamplesReceivedStandard(statsEntry, report);
    }
}
module.exports = StandardStatsExtractor;
