/* eslint-disable */
const { simulateConnection } = require("./test-utils");
const { StatsFormat } = require('../../utils/stats-detection');

const { strict: assert } = require('assert');

describe('TURN PeerConnection tests', () => {
    test.skip('Chrome P2P local relay candidate pair', async () => {
        const { 
            aggregates: { 
                'PC_0' : {
                    candidatePairData: extractedPC0CandidatePair
                }, 
                'PC_1': {
                    candidatePairData: extractedPC1CandidatePair
                }
            } 
        } = await simulateConnection('./src/test/dumps/google-standard-stats-relay-p2p', StatsFormat.CHROME_STANDARD);

        
        const expectedPC0CandidatePair  = {
            "id": "CPtHNT0BaK_YKWYhlaY",
            "isUsingRelay": true,
            "localAddress": "193.122.0.59",
            "localCandidateType": "relay",
            "localPort": 60534,
            "localProtocol": "udp",
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

    test('Chrome P2P remote relay candidate pair', async () => {
        const { 
            aggregates: { 
                'PC_0' : {
                    candidatePairData: extractedPC0CandidatePair
                }, 
                'PC_1': {
                    candidatePairData: extractedPC1CandidatePair
                }
            } 
        } = await simulateConnection('./src/test/dumps/google-standard-stats-remote-relay-p2p', StatsFormat.CHROME_STANDARD);

        
        const expectedPC0CandidatePair  = {
            "id": "CPFBG3Ld9n_jgT+iBVz",
            "isUsingRelay": false,
            "localAddress": "x.x.x.x",
            "localCandidateType": "prflx",
            "localPort": 60129,
            "localProtocol": "udp",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 10000,
            "remoteProtocol": "udp"
        };
            
        const expectedPC1CandidatePair = {
            "id": "CPDep+IkBQ_tU2wE7VZ",
            "isUsingRelay": true,
            "localAddress": "193.122.0.59",
            "localCandidateType": "relay",
            "localPort": 53579,
            "localProtocol": "udp",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 54829,
            "remoteProtocol": "udp"
        };

        assert.deepStrictEqual(extractedPC0CandidatePair, expectedPC0CandidatePair);
        assert.deepStrictEqual(extractedPC1CandidatePair, expectedPC1CandidatePair);
    })

    test('Firefox relay candidate pair', async () => {
        const { 
            aggregates: { 
                'PC_0' : {
                    candidatePairData: extractedPC0CandidatePair
                }, 
                'PC_1': {
                    candidatePairData: extractedPC1CandidatePair
                }
            } 
        } = await simulateConnection('./src/test/dumps/firefox-relay-p2p', StatsFormat.FIREFOX);

        
        const expectedPC0CandidatePair  = {
            "id": "d4ff05f4",
            "isUsingRelay": false,
            "localAddress": "x.x.x.x",
            "localCandidateType": "prflx",
            "localPort": 63055,
            "localProtocol": "udp",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 10000,
            "remoteProtocol": "udp"
        };
            
        const expectedPC1CandidatePair = {
            "id": "687aaf03",
            "isUsingRelay": true,
            "localAddress": "193.122.0.59",
            "localCandidateType": "relay",
            "localPort": 52399,
            "localProtocol": "udp",
            "remoteAddress": "x.x.x.x",
            "remoteCandidateType": "srflx",
            "remotePort": 62390,
            "remoteProtocol": "udp"
        };

        assert.deepStrictEqual(extractedPC0CandidatePair, expectedPC0CandidatePair);
        assert.deepStrictEqual(extractedPC1CandidatePair, expectedPC1CandidatePair);
    })
})