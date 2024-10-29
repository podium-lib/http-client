/**
 * Wait a little bit, promise based.
 * @property {Number} [waitTime=1000]
 * @returns {Promise<void>}
 */
export async function wait(waitTime = 1000) {
    return new Promise((resolve) => {
        setTimeout(async () => {
            resolve();
        }, waitTime);
    });
}
