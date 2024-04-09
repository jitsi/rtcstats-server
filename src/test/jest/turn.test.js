/* eslint-disable */
const { simulateConnection, extractDumpIdFromPath } = require("./test-utils");
const { StatsFormat } = require('../../utils/stats-detection');

const { strict: assert } = require('assert');

describe('TURN PeerConnection tests', () => {

    const dumpPath = './src/test/dumps/google-standard-stats-relay-p2p';

    test('Chrome P2P local relay candidate pair', async () => {
        const { 
            features: {
                aggregates: { 
                    'PC_0' : {
                        candidatePairData: extractedPC0CandidatePair
                    }, 
                    'PC_1': {
                        candidatePairData: extractedPC1CandidatePair
                    }
                } 
            }
        } = await simulateConnection(dumpPath, extractDumpIdFromPath(dumpPath));

        const expectedPC0CandidatePair  = {
            "id": "CPtHNT0BaK_YKWYhlaY",
            "isUsingRelay": true,
            "localAddress": "193.122.0.59",
            "localCandidateType": "relay",
            "localPort": 60534,
            "localProtocol": "tls",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 50424,
            "remoteProtocol": "udp"
        };
            
        const expectedPC1CandidatePair = {
            "id": "CPIslQwktD_FDY2pjwu",
            "isUsingRelay": false,
            "localAddress": "x.x.x.x",
            "localCandidateType": "prflx",
            "localPort": 62026,
            "localProtocol": "udp",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 10000,
            "remoteProtocol": "udp"
        };

        assert.deepStrictEqual(extractedPC0CandidatePair, expectedPC0CandidatePair);
        assert.deepStrictEqual(extractedPC1CandidatePair, expectedPC1CandidatePair);
    });

    test('Chrome SFU local relay candidate pair', async () => {
        
        const dumpPath = './src/test/dumps/chrome-relay';

        const { 
            features: {
                aggregates: { 
                    'PC_0' : {
                        candidatePairData: extractedPC0CandidatePair
                    }
                }
            }
        } = await simulateConnection(dumpPath, extractDumpIdFromPath(dumpPath));

        
        const expectedPC0CandidatePair  = {
            "id": "CPfJfiL0UU_pjplYfUx",
            "isUsingRelay": true,
            "localAddress": "x.x.x.x",
            "localCandidateType": "relay",
            "localPort": 57514,
            "localProtocol": "tls",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 10000,
            "remoteProtocol": "udp"
        };

        assert.deepStrictEqual(extractedPC0CandidatePair, expectedPC0CandidatePair);
    })

    test('Firefox SFU local relay candidate pair', async () => {
        
        const dumpPath = './src/test/dumps/firefox-relay';
        const { 
            features: {
                aggregates: { 
                    'PC_0' : {
                        candidatePairData: extractedPC0CandidatePair
                    }
                }
            } 
        } = await simulateConnection(dumpPath, extractDumpIdFromPath(dumpPath));

        
        const expectedPC0CandidatePair  = {
            "id": "8295c0df",
            "isUsingRelay": true,
            "localAddress": "x.x.x.x",
            "localCandidateType": "relay",
            "localPort": 53054,
            "localProtocol": "tls",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 10000,
            "remoteProtocol": "udp"
        };

        assert.deepStrictEqual(extractedPC0CandidatePair, expectedPC0CandidatePair);
    })

    test('Safari SFU local relay candidate pair', async () => {
        const dumpPath = './src/test/dumps/safari-relay';
        const {
            features: { 
                aggregates: { 
                    'PC_0' : {
                        candidatePairData: extractedPC0CandidatePair
                    }
                }
            }
        } = await simulateConnection(dumpPath, extractDumpIdFromPath(dumpPath));

        // Safari does not have the relayProtocol field in the ice candidate field
        // and the protocol will still read UDP even if TLS relay is used so it is empty.
        const expectedPC0CandidatePair  = {
            "id": "CP7Mq+HAtt_9Idz8Xzg",
            "isUsingRelay": true,
            "localAddress": "x.x.x.x",
            "localCandidateType": "relay",
            "localPort": 60822,
            "localProtocol": "",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 10000,
            "remoteProtocol": "udp"
        };

        assert.deepStrictEqual(extractedPC0CandidatePair, expectedPC0CandidatePair);
    })
})