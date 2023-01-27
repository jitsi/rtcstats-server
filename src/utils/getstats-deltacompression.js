module.exports = {
    /**
     * The function will use `baseStats` as the base line for decompression, where
     * `newStats` is expected to contain just the differences from the base line.
     * It will go through each entry of `newStats` and reconstruct data.
     *
     * @param {Object} baseStats - Complete WebRTC statistics entry.
     * @param {Object} newStats - Delta compressed statistics entry.
     * @returns {Object} - Decompressed `newStats` entry.
     */
    decompress(baseStats, newStats) {
        const timestamp = newStats.timestamp;

        delete newStats.timestamp;

        Object.keys(baseStats).forEach(id => {
            // If the new statistic data does not contain a certain report we consider it was removed.
            // e.g. a ssrc was removed from the connection.
            if (!newStats[id]) {
                delete baseStats[id];
            }
        });

        // Iterate through the new entry and reconstruct it with data that hasn't changed from the base
        // stat
        Object.keys(newStats).forEach(id => {
            if (baseStats[id]) {
                const report = newStats[id];

                // Timestamp will usually be set to 0 in reports but will be saved at the stats level
                // so we don't send it unnecessarily for each report in the stats object.
                if (report.timestamp === 0) {
                    report.timestamp = timestamp;
                } else if (!report.timestamp) {
                    report.timestamp = new Date(baseStats[id].timestamp).getTime();
                }
                Object.keys(report).forEach(name => {
                    baseStats[id][name] = report[name];
                });

            // If there is a new report in the stats data we add the complete structure as there is no
            // base line to construct it from.
            } else {
                if (newStats[id].timestamp === 0) {
                    newStats[id].timestamp = timestamp;
                }
                baseStats[id] = newStats[id];
            }
        });

        return baseStats;
    },
    compress(baseStats, newStats) {
        Object.keys(newStats).forEach(id => {
            if (!baseStats[id]) {
                return;
            }
            const report = newStats[id];

            Object.keys(report).forEach(name => {
                if (report[name] === baseStats[id][name]) {
                    delete newStats[id][name];
                }
                delete report.timestamp;
                if (Object.keys(report).length === 0) {
                    delete newStats[id];
                }
            });
        });

        // TODO: moving the timestamp to the top-level is not compression but...
        newStats.timestamp = new Date();

        return newStats;
    }
};
