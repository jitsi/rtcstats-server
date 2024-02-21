/* eslint-disable */
const { completeFeatureCheck } = require("./test-utils");
const { StatsFormat } = require('../../utils/stats-detection');

describe('Feature extraction tests', () => {

    test('jvb call with camera/desktop video type successions', async () => {
        await completeFeatureCheck(
            './src/test/dumps/9c93a447-c9f8-489d-87ca-21263dec0642',
            './src/test/results/9c93a447-c9f8-489d-87ca-21263dec0642.json'
        );
    });

    test('p2p call with video type set', async () => {
        await completeFeatureCheck(
            './src/test/dumps/59c86272-03ea-42e9-a62d-1c8a272e8ab0',
            './src/test/results/59c86272-03ea-42e9-a62d-1c8a272e8ab0.json'
        );
    });

    test('Chrome PC reconnect', async () => {
        await completeFeatureCheck(
            './src/test/dumps/chrome-standard-pc-reconnect',
            './src/test/results/chrome-standard-pc-reconnect.json',
            StatsFormat.CHROME_STANDARD
        );
    });

    test('Chrome PC failure', async () => {
        await completeFeatureCheck(
            './src/test/dumps/chrome-standard-pc-failed',
            './src/test/results/chrome-standard-pc-failed.json',
        );
    });

    test('Undefined ICE candidate from production', async () => {
        await completeFeatureCheck(
            './src/test/dumps/undefined-ice-candidate',
            './src/test/results/undefined-ice-candidate-result.json',
        );
    });

    test('Chrome multiple peer-to-peer connections', async () => {
        await completeFeatureCheck(
            './src/test/dumps/chrome-standard-multiple-p2p',
            './src/test/results/chrome-standard-multiple-p2p.json',
            StatsFormat.CHROME_STANDARD
        );
    });

    test('Chrome in a peer-to-peer call', async () => {
        await completeFeatureCheck(
            './src/test/dumps/google-standard-stats-p2p',
            './src/test/results/google-standard-stats-p2p-result.json',
            StatsFormat.CHROME_STANDARD,
            ignoreBrowserInfo = true
        );
    });

    test('Chrome 96 in a peer-to-peer call with addTransceiver', async () => {
        await completeFeatureCheck(
            './src/test/dumps/chrome96-standard-stats-p2p-add-transceiver',
            './src/test/results/chrome96-standard-stats-p2p-add-transceiver-result.json',
            StatsFormat.CHROME_STANDARD,
            ignoreBrowserInfo = true
        );
    });

    test('Chrome in a multi-party call', async () => {
        await completeFeatureCheck(
            './src/test/dumps/google-standard-stats-sfu',
            './src/test/results/google-standard-stats-sfu-result.json',
            StatsFormat.CHROME_STANDARD,
            ignoreBrowserInfo = true
        );
    });

    test('Firefox in a multi-party call', async () => {
        await completeFeatureCheck(
            './src/test/dumps/firefox-standard-stats-sfu',
            './src/test/results/firefox-standard-stats-sfu-result.json',
            StatsFormat.FIREFOX,
            ignoreBrowserInfo = true
        );
    });

    test('Firefox 97 in a multi-party call', async () => {
        await completeFeatureCheck(
            './src/test/dumps/firefox97-standard-stats-sfu',
            './src/test/results/firefox97-standard-stats-sfu-result.json',
            StatsFormat.FIREFOX,
            ignoreBrowserInfo = true
        );
    });

    test('Safari in a peer-to-peer call', async () => {
        await completeFeatureCheck(
            './src/test/dumps/safari-standard-stats',
            './src/test/results/safari-standard-stats-result.json',
            StatsFormat.SAFARI,
            ignoreBrowserInfo = true
        );
    });
});
