const assert = require('assert').strict;
const AWS = require('aws-sdk');

/**
 * Service that retrieves secrets from the AWS Secret Store.
 */
class AwsSecretManager {

    /**
     * C'tor
     */
    constructor(config) {
        const { secretmanager: { region, jwtSecretId } = {} } = config;

        assert(region);

        this.jwtSecretId = jwtSecretId;

        this.secretManager = new AWS.SecretsManager({
            region
        });
    }

    /**
     * Retrieve secret string needed to sign webhook JWTs.
     *
     * @returns {string}
     */
    async getJWTAuthSecretString() {

        assert(this.jwtSecretId);

        const secret = await this.secretManager.getSecretValue({
            SecretId: this.jwtSecretId
        }).promise();

        return secret.SecretString;
    }
}

module.exports = AwsSecretManager;
