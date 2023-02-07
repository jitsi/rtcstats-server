const fs = require('fs');
const readline = require('readline');
const Stream = require('stream');

exports.getLastLine = (fileName, minLength) => {
    const inStream = fs.createReadStream(fileName);
    const outStream = new Stream();

    return new Promise((resolve, reject) => {
        const rl = readline.createInterface(inStream, outStream);

        let lastLine = '';

        rl.on('line', line => {
            if (line.length >= minLength) {
                lastLine = line;
            }
        });

        rl.on('error', reject);

        rl.on('close', () => {
            resolve(lastLine);
        });
    });
};

exports.getObjectsByKeys = (fileName, keys) => {
    const inStream = fs.createReadStream(fileName);
    const outStream = new Stream();
    const response = {};

    return new Promise((resolve, reject) => {
        const rl = readline.createInterface(inStream, outStream);

        rl.on('line', line => {
            if (line !== '') {
                const jsonLine = JSON.parse(line);
                const [ type,, obj ] = jsonLine;
                const typeIndex = keys.indexOf(type);

                if (typeIndex >= 0 && obj !== null) {
                    keys.splice(typeIndex, 1);
                    response[type] = obj;
                }
                if (keys.length === 0) {
                    rl.close();
                }
            }
        });

        rl.on('close', () => {
            resolve(response);
        });

        rl.on('error', reject);
    });
};
