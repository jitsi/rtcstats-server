const fs = require('fs');


const logger = require('./logging');
const fileStore = require('./store/file');
const utils = require('./utils/utils');

/**
 *
 */
class OrphanFileHelper {
    /**
     *
     */
    constructor({ tempPath, orphanFileCleanupTimeoutMinutes, wsHandler, cleanupCronIntervalMinutes }) {
        this.tempPath = tempPath;
        this.orphanFileCleanupTimeoutMs = orphanFileCleanupTimeoutMinutes * 60 * 1000;
        this.wsHandler = wsHandler;
        this.cleanupCronIntervalMs = cleanupCronIntervalMinutes * 60 * 1000;
        this.processOldFiles = this.processOldFiles.bind(this);
    }

    /**
     *
     */
    startCron() {
        setInterval(this.cleanupCronIntervalMs, this.processOldFiles);
    }

    /**
     * Remove old files from the temp folder.
     */
    processOldFiles() {
        logger.info('[OrphanFileHelper] Waiting for connections to reconnect.');

        if (fs.existsSync(this.tempPath)) {
            fs.readdirSync(this.tempPath).forEach(fname => {

                const filePath = utils.getDumpPath(this.tempPath, fname);

                logger.debug(`[OrphanFileHelper] Trying to process file ${filePath}`);
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        logger.error(`[OrphanFileHelper] File does not exist! ${filePath}`);
                    }

                    this.processIfExpired(stats, filePath, fname);
                });
            });
        } else {
            logger.error('[OrphanFileHelper] Temp path doesn\'t exists. path: ', this.tempPath);
            throw new Error(`Temp path doesn't exists. tempPath: ${this.tempPath}`);
        }
    }

    /**
     *
     */
    processIfExpired(stats, filePath, fname) {
        const lastModifiedDurationMs = Math.abs(Date.now() - stats.mtime.getTime());

        logger.debug(`[OrphanFileHelper] File last modified ${lastModifiedDurationMs} ms ago:`);
        if (lastModifiedDurationMs > this.orphanFileCleanupTimeoutMs) {
            logger.debug(`[OrphanFileHelper] Start processing the file ${`${filePath}`}`);
            const response = fileStore.getObjectsByKeys(
                filePath, [ 'connectionInfo', 'identity' ]);

            response.then(
                obj => {
                    const jsonObj = obj;
                    let meta;
                    let connectionInfo;

                    if (jsonObj?.connectionInfo) {
                        meta = JSON.parse(jsonObj?.connectionInfo);
                        meta.dumpPath = `${filePath}`;
                    }

                    if (jsonObj?.identity) {
                        connectionInfo = jsonObj?.identity;
                    }

                    this.wsHandler.processData(fname, meta, connectionInfo);
                })
                .catch(e => {
                    logger.error(`[OrphanFileHelper] ${e}`);
                    logger.info(`[OrphanFileHelper] New connection. File doesn't exist. ${filePath}`);
                });
        }
    }
}

module.exports = OrphanFileHelper;
