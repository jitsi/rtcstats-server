/**
 * @typedef {Object} PacketsSummary Packet data for a particular ssrc.
 * @property {Number} packetsLost Total packets lost at a point in time
 * @property {Number} packetsSent Total packets sent at a point in time.
 * @property {String} ssrc Unique ssrc identifier for a track.
 * @property {String} mediaType Type of media either video or audio.
 */

/**
 * @typedef {Object} VideoSummary Video summary data for a particular ssrc.
 * @property {Number} framesPerSecond frames per second at a point in time.
 * @property {Number} frameHeight frame height at a point in time.
 */

/**
 * @typedef {Object} VideoExperience Video experience data for a particular peer connection.
 * @property {VideoSummary} upperBound Video summary of the best video track at a point in time.
 * @property {VideoSummary} lowerBound Video summary of the worse video track at a point in time.
 */
