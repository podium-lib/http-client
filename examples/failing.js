import HttpClient, { HttpClientError } from '../lib/http-client.js';

/**
 * Example of the circuit breaker opening on a failing request.
 */
const client = new HttpClient();
try {
    await client.request({
        origin: 'http://localhost:9099',
        path: '/',
        method: 'GET',
    });
    // eslint-disable-next-line no-unused-vars
} catch (_) {
    // Mute the first one, next request should hit an open breaker
}

try {
    await client.request({
        origin: 'http://localhost:9099',
        path: '/',
        method: 'GET',
    });
} catch (err) {
    if (err instanceof HttpClientError) {
        if (err.code === HttpClientError.ServerDown) {
            console.error('Server unavailable..');
        }
    }
}
