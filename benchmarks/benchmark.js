import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { table } from 'table';
import { fetch } from 'undici';
import { Writable } from 'node:stream';
import { WritableStream } from 'stream/web';
import { isMainThread } from 'node:worker_threads';

import { Pool, Client, Agent, setGlobalDispatcher } from 'undici';

import PodiumHttpClient from '../lib/http-client.js';
const podium = new PodiumHttpClient();

const iterations = (parseInt(process.env.SAMPLES, 10) || 10) + 1;
const errorThreshold = parseInt(process.env.ERROR_TRESHOLD, 10) || 3;
const connections = parseInt(process.env.CONNECTIONS, 10) || 50;
const pipelining = parseInt(process.env.PIPELINING, 10) || 10;
const parallelRequests = parseInt(process.env.PARALLEL, 10) || 100;
const headersTimeout = parseInt(process.env.HEADERS_TIMEOUT, 10) || 0;
const bodyTimeout = parseInt(process.env.BODY_TIMEOUT, 10) || 0;

const dest = {};

if (process.env.PORT) {
    dest.port = process.env.PORT;
    dest.url = `http://localhost:${process.env.PORT}`;
} else {
    dest.url = 'http://localhost';
    dest.socketPath = path.join(os.tmpdir(), 'undici.sock');
}

const httpBaseOptions = {
    protocol: 'http:',
    hostname: 'localhost',
    method: 'GET',
    path: '/',
    query: {
        frappucino: 'muffin',
        goat: 'scone',
        pond: 'moose',
        foo: ['bar', 'baz', 'bal'],
        bool: true,
        numberKey: 256,
    },
    ...dest,
};

const httpNoKeepAliveOptions = {
    ...httpBaseOptions,
    agent: new http.Agent({
        keepAlive: false,
        maxSockets: connections,
    }),
};

const httpKeepAliveOptions = {
    ...httpBaseOptions,
    agent: new http.Agent({
        keepAlive: true,
        maxSockets: connections,
    }),
};

const undiciOptions = {
    path: '/',
    method: 'GET',
    headersTimeout,
    bodyTimeout,
};

const Class = connections > 1 ? Pool : Client;
const dispatcher = new Class(httpBaseOptions.url, {
    pipelining,
    connections,
    ...dest,
});

setGlobalDispatcher(new Agent({ pipelining, connections }));

// eslint-disable-next-line no-unused-vars
class SimpleRequest {
    constructor(resolve) {
        this.dst = new Writable({
            write(chunk, encoding, callback) {
                callback();
            },
        }).on('finish', resolve);
    }
    // eslint-disable-next-line no-unused-vars
    onConnect(abort) {}

    onHeaders(statusCode, headers, resume) {
        this.dst.on('drain', resume);
    }

    onData(chunk) {
        return this.dst.write(chunk);
    }

    onComplete() {
        this.dst.end();
    }

    onError(err) {
        throw err;
    }
}

function makeParallelRequests(cb) {
    return Promise.all(
        Array.from(Array(parallelRequests)).map(() => new Promise(cb)),
    );
}

function printResults(results) {
    // Sort results by least performant first, then compare relative performances and also printing padding
    let last;

    const rows = Object.entries(results)
        // If any failed, put on the top of the list, otherwise order by mean, ascending
        .sort((a, b) => (!a[1].success ? -1 : b[1].mean - a[1].mean))
        .map(([name, result]) => {
            if (!result.success) {
                return [name, result.size, 'Errored', 'N/A', 'N/A'];
            }

            // Calculate throughput and relative performance
            const { size, mean, standardError } = result;
            const relative = last !== 0 ? (last / mean - 1) * 100 : 0;

            // Save the slowest for relative comparison
            if (typeof last === 'undefined') {
                last = mean;
            }

            return [
                name,
                size,
                `${((connections * 1e9) / mean).toFixed(2)} req/sec`,
                `± ${((standardError / mean) * 100).toFixed(2)} %`,
                relative > 0 ? `+ ${relative.toFixed(2)} %` : '-',
            ];
        });

    console.log(results);

    // Add the header row
    rows.unshift([
        'Tests',
        'Samples',
        'Result',
        'Tolerance',
        'Difference with slowest',
    ]);

    return table(rows, {
        columns: {
            0: {
                alignment: 'left',
            },
            1: {
                alignment: 'right',
            },
            2: {
                alignment: 'right',
            },
            3: {
                alignment: 'right',
            },
            4: {
                alignment: 'right',
            },
        },
        drawHorizontalLine: (index, size) => index > 0 && index < size,
        border: {
            bodyLeft: '│',
            bodyRight: '│',
            bodyJoin: '│',
            joinLeft: '|',
            joinRight: '|',
            joinJoin: '|',
        },
    });
}

const experiments = {
    'http - no keepalive'() {
        return makeParallelRequests((resolve) => {
            http.get(httpNoKeepAliveOptions, (res) => {
                res.pipe(
                    new Writable({
                        write(chunk, encoding, callback) {
                            callback();
                        },
                    }),
                ).on('finish', resolve);
            });
        }).catch(console.log);
    },

    'http - keepalive'() {
        return makeParallelRequests((resolve) => {
            http.get(httpKeepAliveOptions, (res) => {
                res.pipe(
                    new Writable({
                        write(chunk, encoding, callback) {
                            callback();
                        },
                    }),
                ).on('finish', resolve);
            });
        }).catch(console.log);
    },

    fetch() {
        return makeParallelRequests((resolve) => {
            fetch('http://localhost:3042')
                .then((res) => {
                    res.body.pipeTo(
                        new WritableStream({
                            write() {},
                            close() {
                                resolve();
                            },
                        }),
                    );
                })
                .catch(console.log);
        });
    },

    'undici - pipeline'() {
        return makeParallelRequests((resolve) => {
            dispatcher
                .pipeline(undiciOptions, (data) => {
                    return data.body;
                })
                .end()
                .pipe(
                    new Writable({
                        write(chunk, encoding, callback) {
                            callback();
                        },
                    }),
                )
                .on('finish', resolve);
        }).catch(console.log);
    },

    'undici - request'() {
        return makeParallelRequests((resolve) => {
            dispatcher
                .request(undiciOptions)
                .then(({ body }) => {
                    body.pipe(
                        new Writable({
                            write(chunk, encoding, callback) {
                                callback();
                            },
                        }),
                    ).on('finish', resolve);
                })
                .catch(console.log);
        });
    },

    'podium-http - request'() {
        return makeParallelRequests((resolve) => {
            podium.request('http://localhost:3042').then(({ body }) => {
                body.pipe(
                    new Writable({
                        write(chunk, encoding, callback) {
                            callback();
                        },
                    }),
                ).on('finish', resolve);
            });
        }).catch(console.log);
    },
};

async function main() {
    const { cronometro } = await import('cronometro');

    cronometro(
        experiments,
        {
            iterations,
            errorThreshold,
            print: false,
        },
        (err, results) => {
            if (err) {
                throw err;
            }

            console.log(printResults(results));
            //      dispatcher.destroy()
        },
    );
}

let foolMain;

if (isMainThread) {
    // console.log('I am in main thread');
    main();
    //return;
} else {
    foolMain = main;
    // console.log('I am NOT in main thread');
}
export default foolMain;
