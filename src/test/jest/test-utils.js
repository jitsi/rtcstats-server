/* eslint-disable */
const DumpFileProcessor = require('../../worker-pool/DumpFileProcessor');

const { strict: assert } = require('assert');
const fs = require('fs');

// The JSON.stringify spec does not garantee the sort order of the object keys (i.e. different objects with the same
// properties can have different string serialization). This replacer can be used to sort the object keys for a stable
// JSON serialization, even across different objects.
const replacer = (key, val) => val instanceof Object && !(val instanceof Array)
    ? Object.keys(val).sort().reduce((sorted, key) => { sorted[key] = val[key]; return sorted }, {}) : val;

async function simulateConnection(dumpPath, clientId) {

    const dumpMeta = {
        dumpPath,
        clientId
    };

    //const featExtractor = new FeatureExtractor(dumpMeta);
    const dumpFileProcessor = new DumpFileProcessor(dumpMeta);
    const processResult = await dumpFileProcessor.processStatsFile();

    return processResult;
}

async function completeFeatureCheck(dumpPath, expectedResultPath) {
    
    const extractedFeatures = await simulateConnection(dumpPath, extractDumpIdFromPath(dumpPath));

    const rawExpectedResults = fs.readFileSync(expectedResultPath);
    const expectedResultsList = JSON.parse(rawExpectedResults);

    const [firstExpectedResult = {}] = expectedResultsList;
    const { features: expectedFeatures } = firstExpectedResult;

    const fix = process.argv.filter((x) => x.startsWith('--fix'))[0]
    if (fix) {
        expectedResultsList[0].features = extractedFeatures;

        fs.writeFile(expectedResultPath, JSON.stringify(expectedResultsList, replacer, 2), err => {
            if (err) {
                console.error(err);
            }
        });
    }
    
    // if (ignoreBrowserInfo) {
    //     delete extractedFeatures.browserInfo;
    //     delete expectedFeatures.browserInfo;
    // }

    assert.deepStrictEqual(extractedFeatures.features, expectedFeatures);
}

function clearObjectUndefinedValues(object) {
    return JSON.parse(JSON.stringify(object));
}

/**
 * Waits for a condition to be met.
 * 
 * @param {number} waitUntilSec - The maximum time to wait in seconds.
 * @param {function} checkFunction - The function to check.
 * @returns {Promise} A promise that resolves when the condition is met.
 * @throws {Error} If the condition is not met within the specified time.
 */
async function waitForCheck(waitUntilSec, checkFunction) {
    for (let elapsedSec = 0; elapsedSec < waitUntilSec; elapsedSec++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (checkFunction()) {
            return;
        }
    }
    throw new Error(`Check function was not met within ${waitUntilSec} seconds`);
}


function extractDumpIdFromPath(url) {
    let parts = url.split('/');
    return parts[parts.length - 1];
}


module.exports = {
    clearObjectUndefinedValues,
    completeFeatureCheck,
    extractDumpIdFromPath,
    simulateConnection,
    waitForCheck
}