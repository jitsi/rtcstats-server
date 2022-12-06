const assert = require('assert').strict;
const axios = require('axios');
const jwt = require('jsonwebtoken');


const logger = require('../logging');
const { uuidV4, getSecondsSinceEpoch, addPKCS8ContainerAndNewLine } = require('../utils/utils');

const RTCSTATS_UPLOADED_HOOK = 'RTCSTATS_UPLOADED';

/**
 * Extracts necessary metadata and sends JaaS webhooks.
 */
class WebhookSender {
    /**
     * C'tor
     *
     * @param {Object} config
     */
    constructor(config, secretManager) {
        const { webhooks: {
            apiEndpoint,
            jwtIssuer,
            jwtAudience,
            jwtTTLSec } = {} } = config;

        assert(apiEndpoint);
        assert(jwtIssuer);
        assert(jwtAudience);
        assert(jwtTTLSec);
        assert(secretManager);

        this.apiEndpoint = apiEndpoint;
        this.issuer = jwtIssuer;
        this.audience = jwtAudience;
        this.jwtTTLSec = jwtTTLSec;
        this.jwtExpirationEpochSec = 0;
        this.jwtRegenTimeEpochSec = 0;
        this.secretManager = secretManager;
    }

    /**
     * Initialize necessary state for service.
     */
    async init() {
        // Expected format:
        // {
        //     "auth": {
        //         "jwt": {
        //             "meetings": {
        //                 "privateKey": "XXXX",
        //                 "kid": "XXXX"
        //             }
        //         }
        //     }
        // }

        const jwtSecretString = await this.secretManager.getJWTAuthSecretString();
        const jwtSecret = JSON.parse(jwtSecretString);
        const { auth: { jwt: { meetings: { kid, privateKey } } } } = jwtSecret;

        this.keyid = kid;
        this.base64PEMPcks8 = privateKey;

        // The expected format for the private key does not contain PCKS8 header/footer and new lines
        // every 64 character, but the jwt library expects them so they are manually added.
        this.pemPrivateKey = addPKCS8ContainerAndNewLine(this.base64PEMPcks8);
    }

    /**
     * Regenerate jwt hook.
     *
     * @param {number} currentDateEpochSec - seconds since epoch timestamp.
     */
    _regenerateJWT(currentDateEpochSec) {
        this.jwtExpirationSec = currentDateEpochSec + this.jwtTTLSec;

        // We regenerate the jwt earlier so that we take into account delays (queueing, network transport) before
        // the hook is actually processed by the service.
        this.jwtRegenTimeEpochSec = this.jwtExpirationSec - (this.jwtTTLSec / 10);

        logger.info(
            `[Webhooks] Regenerating jwt exp: ${this.jwtExpirationSec}, regenerate: ${this.jwtRegenTimeEpochSec}`);

        const jwtPayload = {
            aud: this.audience,
            sub: '*',
            scd: 'any',
            iss: this.issuer,
            exp: this.jwtExpirationSec,
            iat: currentDateEpochSec
        };

        const jwtHeader = {
            algorithm: 'RS256',
            keyid: this.keyid
        };

        this.jwtToken = jwt.sign(
            jwtPayload,
            this.pemPrivateKey,
            jwtHeader
        );
    }

    /**
     * The JWT will expire after a predefined timeout, regenerate it if that's the case.
     */
    _getValidJWT() {
        const currentDateEpochSec = getSecondsSinceEpoch();

        if (currentDateEpochSec > this.jwtRegenTimeEpochSec) {
            this._regenerateJWT(currentDateEpochSec);
        }

        return this.jwtToken;
    }

    /**
     * Send RTCSTATS_UPLOADED to the configured JaaS webhook API.
     *
     * @param {Object} sinkMeta - Metadata associated with the current session.
     */
    sendRtcstatsUploadedHook(sinkMeta, signedLink) {
        const {
            jaasClientId,
            jaasMeetingFqn,
            sessionId,
            jaasParticipantId,
            endpointId,
            userId
        } = sinkMeta;

        const webhookObj = {
            eventType: RTCSTATS_UPLOADED_HOOK, // webhook name
            idempotencyKey: uuidV4(), // unique identifier for a specific hook.
            customerId: jaasClientId, // (vpaas-magic-cookie-xxxx-yyyy-xxx)
            sessionId, // refers to meetinguniqueid
            created: Date.now(),
            submitted: Date.now(),
            meetingFqn: jaasMeetingFqn,
            data: {
                statsUrl: signedLink, // rtcstats dump download url
                participantId: jaasParticipantId,
                participantName: userId,
                endpointId
            }
        };

        axios.post(
            this.apiEndpoint,
            webhookObj,
            {
                headers: {
                    // eslint-disable-next-line max-len
                    // pks8encoded key, decode base64 - pkcs8, rsa256 sau 512
                    'Authorization': `Bearer ${this._getValidJWT()}`
                }
            })
            .then(response => {
                logger.info('[WebhookSender] Webhook successfully sent %j, status %s', webhookObj, response.status);
            })
            .catch(error => {
                logger.error('[WebhookSender] Failed to send webhook with error %j', error);
            });
    }
}

module.exports = WebhookSender;
