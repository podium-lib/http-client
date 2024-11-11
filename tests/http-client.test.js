import { after, before, beforeEach, test } from 'node:test';
import { notStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict';
import http from 'node:http';

import HttpClient from '../lib/http-client.js';
import { wait } from './utilities.js';

let httpServer,
    host = 'localhost',
    port = 3003;
const url = `http://${host}:${port}`;

function startServer() {
    return new Promise((resolve) => {
        httpServer = http.createServer(async (request, response) => {
            if (request.url === '/not-found') {
                response.writeHead(404);
            } else {
                response.writeHead(200);
            }
            response.end();
        });
        httpServer.listen(port, host, resolve);
    });
}

function closeServer(s) {
    return new Promise((resolve) => {
        s.close(resolve);
    });
}

async function stopServer(client, server = httpServer) {
    if (client) {
        await client.close();
    }
    await closeServer(server);
}

async function queryUrl({
    client,
    path = '/',
    url = `http://${host}:${port}`,
    loop = 2,
    suppressErrors = true,
}) {
    const errors = [];
    for (let i = 0; i <= loop; i++) {
        try {
            await client.request({ path, origin: url, method: 'GET' });
        } catch (err) {
            // Push the actual cause here for the tests
            if (!suppressErrors) errors.push(err);
        }
    }
    if (errors.length > 0) {
        throw new Error(errors.toString());
    }
}

await test('http-client - basics', async (t) => {
    const url = `http://${host}:2001`;
    const server = http.createServer(async (request, response) => {
        response.writeHead(200);
        response.end();
    });
    server.listen(2001, host);
    await t.test('returns 200 response when given valid input', async () => {
        const client = new HttpClient();
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        strictEqual(response.statusCode, 200);
        await client.close();
    });

    await t.test('does not cause havoc with built in fetch', async () => {
        const client = new HttpClient();
        await fetch(url);
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        strictEqual(response.statusCode, 200);
        await client.close();
        await fetch(url);
        await client.close();
    });

    await t.test('throws error when no fallback provided', async () => {
        const client = new HttpClient();
        rejects(
            async () => {
                await client.request({
                    path: '/',
                    origin: 'https://does-not-exist.domain',
                    method: 'GET',
                });
            },
            {
                name: 'Error',
            },
        );
        await client.close();
    });
    await t.test('does not throw when fallback provided', async () => {
        let isCaught = false;
        const client = new HttpClient({
            fallback: () => {
                isCaught = true;
            },
        });

        await client.request({
            path: '/',
            origin: 'https://does-not-exist.domain',
            method: 'GET',
        });
        strictEqual(isCaught, true);
        await client.close();
    });

    await closeServer(server);
});

await test('http-client - timeouts', async (t) => {
    // let slowServer;
    // async function b() {
    //     // Slow responding server to enable us to abort a request
    //     slowServer = http.createServer(async (request, response) => {
    //         await wait(3000);
    //         response.writeHead(200);
    //         response.end();
    //     });
    //     slowServer.listen(2010, host);
    // }
    // function a() {
    //     try {
    //         slowServer.close(() => console.log('server closed...'));
    //         slowServer.closeAllConnections();
    //     } catch (e) {
    //         console.log('**___***', e);
    //     }
    // }
    // await t.test('can cancel a request with an abort controller', async () => {
    //     await b();
    //     const controller = new AbortController();
    //     const client = new HttpClient({ timeout: 10000 });
    //     const performRequest = async () => {
    //         try {
    //             await client.request({
    //                 path: '/',
    //                 origin: 'http://localhost:2010',
    //                 method: 'GET',
    //                 signal: controller.signal,
    //             });
    //         } catch (e) {
    //             //
    //             console.error('ess');
    //         }
    //     };
    //     performRequest();
    //     controller.abort();
    //     ok(controller.signal.aborted);
    //     await client.close();
    //     await a();
    // });

    await t.test('can cancel a request with an abort controller', async () => {
        const abortController = new AbortController();
        const client = new HttpClient({ timeout: 100 });
        await rejects(async () => {
            await client.request({
                path: '/',
                origin: 'http://localhost:2010',
                method: 'GET',
                signal: abortController.signal,
            });
            await client.close();
        }, 'RequestAasasortkmlklmlkmedErrsor');
    });

    // await t.test('auto renew an abort controller', async () => {
    //     const abortController = new AbortController();
    //     const client = new HttpClient({ timeout: 2000 });
    //     await client.request({
    //         autoRenewAbortController: true,
    //         path: '/',
    //         origin: 'http://localhost:2010',
    //         method: 'GET',
    //     });
    //     await client.close();
    // });
});

await test('http-client - redirects', async (t) => {
    let to, from;
    before(async function () {
        to = http.createServer(async (request, response) => {
            response.writeHead(200);
            response.end();
        });
        to.listen(3033, host);
        from = http.createServer(async (request, response) => {
            if (request.url === '/redirect') {
                response.setHeader('location', 'http://localhost:3033');
            }
            response.writeHead(301);
            response.end();
        });
        from.listen(port, host);
    });
    after(function () {
        from.close();
        to.close();
    });

    await t.test('redirectable true follows redirects', async () => {
        const client = new HttpClient();
        const response = await client.request({
            method: 'GET',
            origin: `http://${host}:${port}`,
            path: '/redirect',
            redirectable: true,
        });
        await client.close();
        strictEqual(response.statusCode, 200);
    });
    // await t.test.skip('throw on max redirects', async () => {});
    await t.test('does not follow redirects by default', async () => {
        const client = new HttpClient();
        const response = await client.request({
            method: 'GET',
            origin: `http://${host}:${port}`,
            path: '/redirect',
        });
        strictEqual(response.statusCode, 301);
        await client.close();
    });
});

await test('http-client - circuit breaker behaviour', async (t) => {
    beforeEach(startServer);
    await t.test('opens on failure threshold', async () => {
        const invalidUrl = `http://${host}:3013`;
        const client = new HttpClient({ threshold: 50 });

        let broken = 0;
        for (let i = 0; i < 5; i++) {
            try {
                await client.request({
                    path: '/',
                    origin: invalidUrl,
                    method: 'GET',
                });
            } catch (err) {
                if (err.toString() === 'Error: Breaker is open') {
                    broken++;
                }
            }
        }
        strictEqual(
            broken,
            4,
            `breaker open on 4 out of 5 requests, was ${broken}`,
        );
        await client.close();
        await stopServer(client);
    });

    await t.test('can reset breaker', async () => {
        const invalidUrl = `http://${host}:3023`;
        const breakerReset = 10;
        const client = new HttpClient({ threshold: 50, reset: breakerReset });
        let isOpen = false;
        try {
            await queryUrl({
                client,
                loop: 4,
                url: invalidUrl,
                suppressErrors: false,
            });
        } catch (err) {
            if (err.toString().indexOf('Breaker is open') !== -1) {
                isOpen = true;
            }
        }
        strictEqual(isOpen, true, `breaker opened, ${isOpen}`);
        await wait(breakerReset + 10); // wait for the breaker to close
        const response = await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        strictEqual(response.statusCode, 200);
        await client.close();
        await stopServer(client);
    });
});

await test('http-client: metrics', async (t) => {
    await t.test('has a .metrics property', () => {
        const client = new HttpClient();
        notStrictEqual(client.metrics, undefined);
    });
    await t.test('request metrics', async () => {
        await startServer();
        const client = new HttpClient();
        const metrics = [];
        client.metrics.on('data', (metric) => {
            metrics.push(metric);
        });
        client.metrics.on('end', () => {});
        await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        await client.request({
            path: '/not-found',
            origin: url,
            method: 'GET',
        });
        client.metrics.push(null);
        client.metrics.on('end', () => {
            const requestMetrics = metrics.filter(
                (m) =>
                    m.name === 'http_client_request_duration' ||
                    m.name === 'http_client_request_error',
            );
            strictEqual(requestMetrics.length, 3);
            strictEqual(requestMetrics[0].name, 'http_client_request_duration');
            strictEqual(requestMetrics[0].type, 5);
            strictEqual(requestMetrics[0].labels[0].name, 'method');
            strictEqual(requestMetrics[0].labels[0].value, 'GET');
            strictEqual(requestMetrics[0].labels[1].name, 'status');
            strictEqual(requestMetrics[0].labels[1].value, 200);
            strictEqual(requestMetrics[0].labels[2].name, 'url');
            strictEqual(
                requestMetrics[0].labels[2].value,
                'http://localhost:3003/',
            );
            ok(requestMetrics[0].value > 0);

            strictEqual(requestMetrics[2].type, 2);
            strictEqual(requestMetrics[2].name, 'http_client_request_error');
            strictEqual(requestMetrics[2].labels[0].name, 'method');
            strictEqual(requestMetrics[2].labels[0].value, 'GET');
            strictEqual(requestMetrics[2].labels[1].name, 'status');
            strictEqual(requestMetrics[2].labels[1].value, 404);
        });
        await client.close();
        await stopServer(client);
    });

    await t.test('breaker metrics', async () => {
        await startServer();
        const client = new HttpClient({
            reset: 10,
            timeout: 1000,
            throwOn400: false,
            throwOn500: false,
        });
        const metrics = [];
        client.metrics.on('data', (metric) => {
            metrics.push(metric);
        });
        client.metrics.on('end', () => {
            strictEqual(metrics.length, 4, JSON.stringify(metrics));

            strictEqual(metrics[0].name, 'http_client_breaker_events');
            strictEqual(metrics[0].type, 2);
            strictEqual(metrics[0].labels[0].value, 'open');

            strictEqual(metrics[2].name, 'http_client_breaker_events');
            strictEqual(metrics[2].type, 2);
            strictEqual(metrics[2].labels[0].value, 'close');

            strictEqual(metrics[3].name, 'http_client_breaker_events');
            strictEqual(metrics[3].type, 2);
            strictEqual(metrics[3].labels[0].value, 'success');
        });
        try {
            // Make the circuit open
            await client.request({
                path: '/not-found',
                origin: 'http://not.found.host:3003',
            });
            // eslint-disable-next-line no-unused-vars
        } catch (_) {
            /* empty */
        }
        await wait(10);
        // Wait for circuit to reset, before using the client again.
        await client.request({
            path: '/',
            origin: url,
            method: 'GET',
        });
        client.metrics.push(null);
        await client.close();
        await stopServer(client);
    });
});
