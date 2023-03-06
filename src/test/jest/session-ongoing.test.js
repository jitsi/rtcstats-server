/* eslint-disable no-undef */
/* eslint-disable max-len */

// jest.mock('fs', () => {
//     return {
//         existsSync: jest.fn((path) => {
//             console.log('-----------> Calling exists sync');
//             //return true;
//         })
//     };
// });
const fs = require('fs');

const { isSessionOngoing } = require('../../utils/utils');

jest.mock('fs');

// const fs = {
//     existsSync: jest.fn((path) => {
//         console.log('-----------> Calling exists sync');
//     })
// };

// const getUrlParameter = jest.fn((url, parameterName) => {

//     console.log('-----------> Calling getUrlParameter');
//     if (parameterName === 'statsSessionId') {
//         return 'abc123';
//     }
// });

const tempPath = '/tmp';

describe('isSessionOngoing', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Should return true if the URL contains a statsSessionId parameter and the corresponding dump file exists', () => {

        const url = 'https://example.com/?statsSessionId=abc123';

        fs.existsSync.mockReturnValueOnce(true);

        const isOngoing = isSessionOngoing(url, tempPath);

        expect(fs.existsSync).toHaveBeenCalled();
        expect(isOngoing).toBe(true);
    });

    it('Should return false if the URL contains a statsSessionId parameter but the corresponding dump file does not exist', () => {
        const url = 'https://example.com/?statsSessionId=abc123';

        fs.existsSync.mockReturnValueOnce(false);

        const isOngoing = isSessionOngoing(url, tempPath);

        expect(fs.existsSync).toHaveBeenCalled();
        expect(isOngoing).toBe(false);
    });

    it('should return false if the URL does not contain a statsSessionId parameter', () => {
        const url = 'https://example.com/';

        fs.existsSync.mockReturnValueOnce(false);

        const isOngoing = isSessionOngoing(url, tempPath);

        expect(isOngoing).toBe(false);
        expect(fs.existsSync).not.toHaveBeenCalled();
    });
});
