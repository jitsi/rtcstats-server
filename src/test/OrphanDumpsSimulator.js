const config = require('config');
const fs = require('fs');
const path = require('path');

const { uuidV4 } = require('../utils/utils');

const { waitForCheck } = require('./jest/test-utils');


/**
 *
 */
class OrphanDumpsSimulator {
    /**
     * Create a OrphanDumpsSimulator.
     * @param {Object} server - The server object.
     * @param {number} dumpNr - The number of dump files to simulate.
     * @constructor
     */
    constructor(server, dumpNr = 300) {
        this.server = server;
        this.dumpNr = dumpNr;
        this.tempPath = config.server.tempPath;
        this.dumpPaths = [
            './src/test/dumps/google-standard-stats-p2p',
            './src/test/dumps/firefox-standard-stats-sfu',
            './src/test/dumps/safari-standard-stats'
        ];
        this.dumpNrPerType = Math.floor(dumpNr / this.dumpPaths.length);
    }

    /**
     * Populate the temp directory with orphan dump files.
     */
    populateWithOrphanDumps() {

        fs.mkdirSync(this.tempPath, { recursive: true });

        // Remove all files from tempPath
        const files = fs.readdirSync(this.tempPath);

        files.forEach(file => {
            const filePath = path.join(this.tempPath, file);

            fs.unlinkSync(filePath);
        });

        this.dumpPaths.forEach(dumpPath => {
            for (let i = 0; i < this.dumpNrPerType; i++) {
                const newFileName = `${uuidV4()}`;
                const newFilePath = path.join(this.tempPath, newFileName);

                fs.copyFileSync(dumpPath, newFilePath);
            }
        });
    }

    /**
     *
     * @param {*} server
     */
    _checkOrphanDumpProcessFinish() {
        return this.server.PromCollector.processed.get().values[0].value === this.dumpNr;
    }

    /**
     *
     * @returns
     */
    async waitForTestCompletion() {
        return await waitForCheck(10, this._checkOrphanDumpProcessFinish.bind(this));
    }
}

module.exports = OrphanDumpsSimulator;
