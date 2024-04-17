const assert = require('assert').strict;
const fs = require('fs');
const sizeof = require('object-sizeof');
const readline = require('readline');

const BackendFeatureExtractor = require('../features/BackendFeatureExtractor');
const FeatureExtractor = require('../features/StandardFeatureExtractor');
const { ConnectionInformation, ClientType } = require('../utils/ConnectionInformation');

// JICOFO_CLIENT
// ["connectionInfo",
// null,
// "{\"path\":\"/\",
//   \"origin\":\"meet-jit-si-eu-frankfurt-1-s11.meet.jit.si\",
//   \"url\":\"meet-jit-si-eu-frankfurt-1-s11.meet.jit.si/\",
//   \"userAgent\":\"Node v20.5.1\",
//   \"clientProtocol\":\"1.0_JICOFO\",
//   \"statsFormat\":\"unsupported\",
//   \"clientType\":\"JICOFO_CLIENT\"}",
//  1707671167613]

// JVB_CLIENT
// ["connectionInfo",
// null,
// "{\"path\":\"/\",
// \"origin\":\"prod-8x8-jvb-66-81-164.8x8.vc\",
// \"url\":\"prod-8x8-jvb-66-81-164.8x8.vc/\",
// \"userAgent\":\"Node v16.20.0\",
// \"clientProtocol\":\"3.0_JVB\",
// \"statsFormat\":\"unsupported\",
// \"clientType\":\"JVB_CLIENT\"}",
// 1707674478276]

// JIGASI_CLIENT
// ["connectionInfo",
// null,
// "{\"path\":\"/\",
// \"origin\":\"prod-8x8-jigasi-63-62-109.8x8.vc\",
// \"url\":\"prod-8x8-jigasi-63-62-109.8x8.vc/\",
// \"userAgent\":\"Node v20.5.1\",
// \"clientProtocol\":\"1.0_JIGASI\",
// \"statsFormat\":\"unsupported\",
// \"clientType\":\"JIGASI_CLIENT\"}",
// 1707673222477]

// RTCSTATS_CLIENT
// ["connectionInfo",
// null,
// "{\"path\":\"//absentbreakdownspicturesame\",
// \"origin\":\"https://meet.jit.si\",
// \"url\":\"https://meet.jit.si//absentbreakdownspicturesame\",
// \"userAgent\":\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/118.0\",
// \"clientProtocol\":\"3.1_STANDARD\",
// \"statsFormat\":\"firefox\",
// \"clientType\":\"RTCSTATS_CLIENT\"}"
// 1697705955011]

/**
 * @fileoverview
 */
class DumpFileProcessor {
    /**
     *
     * @param {*} param0
     */
    constructor({ dumpPath, clientId }) {
        this.dumpPath = dumpPath;
        this.clientId = clientId;
        this.processEntry = this.processConnectionInfoHeader;
        this.featureExtractor = null;
    }

    /**
     *
     * @returns
     */
    processConnectionInfoHeader(line, lineSize) {
        const lineObj = JSON.parse(line);
        const [ requestType, , connectionInfoEntry ] = lineObj;

        assert(requestType === 'connectionInfo', 'Unexpected request type');

        let connectionInfo;

        // TODO - this is added so we can keep backward compatibility with the old format
        // after the initial deploy this can be removed
        if (typeof connectionInfoEntry === 'string') {
            connectionInfo = JSON.parse(connectionInfoEntry);
        } else if (typeof connectionInfoEntry === 'object') {
            connectionInfo = connectionInfoEntry;
        } else {
            throw new Error('connectionInfo must be a string or an object');
        }

        // "{\"path\":\"//absentbreakdownspicturesame\",
        // \"origin\":\"https://meet.jit.si\",
        // \"url\":\"https://meet.jit.si//absentbreakdownspicturesame\",
        // \"userAgent\":\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/118.0\",
        // \"clientProtocol\":\"3.1_STANDARD\",
        // \"statsFormat\":\"firefox\",
        // \"clientType\":\"RTCSTATS_CLIENT\"}"
        this.connectionInfo = new ConnectionInformation(connectionInfo);

        if (this.connectionInfo.getClientType() === ClientType.RTCSTATS) {
            this.featureExtractor = new FeatureExtractor({
                dumpPath: this.dumpPath,
                clientId: this.clientId,
                connectionInfo: this.connectionInfo
            });
        } else {
            this.featureExtractor = new BackendFeatureExtractor({
                dumpPath: this.dumpPath,
                clientId: this.clientId,
                connectionInfo: this.connectionInfo
            });
        }

        this.featureExtractor?.handleDumpEntry(lineObj, lineSize);

        this.processEntry = this.processStatsEntry;
    }

    /**
     *
     * @param {*} rl
     */
    processStatsEntry(line, lineSize) {
        const lineObj = JSON.parse(line);

        this.featureExtractor?.handleDumpEntry(lineObj, lineSize);
    }

    /**
     *
     */
    async processStatsFile() {
        try {
            const readStream = fs.createReadStream(this.dumpPath);

            this.readInterface = readline.createInterface({
                input: readStream
            });

            for await (const line of this.readInterface) {
                const lineSize = sizeof(line);

                this.processEntry(line, lineSize);
            }

            const extractedData = await this.featureExtractor?.extract();

            return extractedData;
        } finally {
            this.readInterface?.close();
        }
    }
}


module.exports = DumpFileProcessor;
