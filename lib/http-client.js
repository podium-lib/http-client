import { Agent, interceptors, request } from 'undici';
import createError from 'http-errors';
import Opossum from 'opossum';
import abslog from 'abslog';
import Metrics from '@metrics/client';

/**
 * @typedef HttpClientRequestOptionsAdditions
 * @property {AbortSignal} [signal]
 *
 * @typedef FollowRedirectsOptions
 * @property {boolean} [enabled=false]
 * @property {boolean} [maxRedirections=2]
 * @property {boolean} [throwOnMaxRedirects=true]
 *
 * @typedef {import('undici').Dispatcher.ResponseData} HttpClientResponse
 *
 * @typedef {import('undici').Dispatcher.DispatchOptions & HttpClientRequestOptionsAdditions} HttpClientRequestOptions
 *
 * @typedef HttpClientOptions
 * @property {string} [clientName] - client name
 * @property {Number} [connections=50] - @see https://undici.nodejs.org/#/docs/api/Pool?id=parameter-pooloptions
 * @property {Number} [keepAliveMaxTimeout] - @see https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions
 * @property {Number} [keepAliveTimeout] - @see https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions
 * @property {import('abslog')} [logger] - A logger instance compatible with abslog .
 * @property {Number} [pipelining=10] - @see https://undici.nodejs.org/#/?id=pipelining
 * @property {Number} [reset=20000] - Circuit breaker: How long, in milliseconds, to wait before a tripped circuit should be reset.
 * @property {Number} [threshold=25] - Circuit breaker: How many, in %, requests should error before the circuit should trip. Ex; when 25% of requests fail, trip the circuit.
 * @property {Boolean} [throwOn400=false] - If the client should throw on http 400 errors. If true, http 400 errors will count against tripping the circuit.
 * @property {Boolean} [throwOn500=true] - If the client should throw on http 500 errors. If true, http 500 errors will count against tripping the circuit.
 * @property {Number} [timeout=500] - Circuit breaker: How long, in milliseconds, a request can maximum take. Requests exceeding this limit counts against tripping the circuit.
 **/

/**
 * Client for making HTTP requests, comes with a built-in circuit breaker functionality to prevent
 * performing denial of service attacks when target URL is down.
 */
export default class HttpClient {
    #agent;
    /** @type {import('opossum')} */ #breaker;
    #breakerCounter;
    #logger;
    #clientName;
    #metrics = new Metrics();
    #errorCounter;
    #requestDuration;
    #throwOn400;
    #throwOn500;

    /**
     * @property {HttpClientOptions} options - client options
     */
    constructor({
        clientName = '',
        connections = 50,
        keepAliveMaxTimeout = undefined,
        keepAliveTimeout = undefined,
        logger = undefined,
        pipelining = 10,
        reset = 20000,
        throwOn400 = false,
        throwOn500 = false,
        threshold = 25,
        timeout = 500,
    } = {}) {
        this.#logger = abslog(logger);
        this.#clientName = clientName;
        this.#throwOn400 = throwOn400;
        this.#throwOn500 = throwOn500;

        this.#breaker = new Opossum(this.#request.bind(this), {
            errorThresholdPercentage: threshold,
            resetTimeout: reset,
            timeout,
        });

        this.#errorCounter = this.#metrics.counter({
            name: 'http_client_request_error',
            description: 'Requests resulting in an error',
        });

        this.#requestDuration = this.#metrics.histogram({
            name: 'http_client_request_duration',
            description: 'Request duration',
            labels: {
                method: undefined,
                status: undefined,
                url: undefined,
            },
            buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 10],
        });

        this.#breakerCounter = this.#metrics.counter({
            name: 'http_client_breaker_events',
            description: 'Metrics on breaker events',
        });

        // See https://github.com/nodeshift/opossum/?tab=readme-ov-file#events
        // for details on events.
        for (const eventName of this.#breaker.eventNames()) {
            //@ts-ignore
            const event = eventName;
            //@ts-ignore
            if (['open', 'close', 'reject'].includes(event)) {
                //@ts-ignore
                this.#breaker.on(event, (e) => {
                    this.#logger.debug(
                        `breaker event '${String(event)}', client name '${this.#clientName}'`,
                    );
                    let obj = Array.isArray(e) ? e[0] : e;
                    this.#breakerCounter.inc({
                        labels: {
                            //@ts-ignore
                            name: event,
                            ...(obj && obj.path && { path: obj.path }),
                            ...(obj && obj.origin && { origin: obj.origin }),
                        },
                    });
                });
            }
        }

        this.#agent = new Agent({
            keepAliveMaxTimeout,
            keepAliveTimeout,
            connections,
            pipelining,
        });
    }

    /**
     * Returns metrics object for the client.
     * @returns {import('@metrics/client')}
     */
    get metrics() {
        return this.#metrics;
    }

    /**
     * Performs an http requests using the passed in options.
     * @param {HttpClientRequestOptionsAdditions | Object} options
     * @returns {Promise<HttpClientResponse>}
     */
    async #request(options = {}) {
        if (options.redirectable) {
            const { redirect } = interceptors;
            options.dispatcher = this.#agent.compose(
                redirect({ maxRedirections: 1 }),
            );
        } else {
            options.dispatcher = this.#agent;
        }

        const stopRequestTimer = this.#requestDuration.timer();
        const response = await request({
            ...options,
        });
        const { statusCode, body } = response;

        stopRequestTimer({
            labels: {
                method: options.method,
                status: statusCode,
                url: `${options.origin}${options.path}`,
            },
        });

        if (statusCode >= 400) {
            this.#errorCounter.inc({
                labels: {
                    method: options.method,
                    status: statusCode,
                    url: options.url,
                },
            });
        }
        // TODO Look into this, as the resovlers have their own handling of this
        // In order to be backward compatible, both throw options must be false
        if (
            (this.#throwOn400 || options.throwable) &&
            statusCode >= 400 &&
            statusCode <= 499
        ) {
            // Body must be consumed; https://github.com/nodejs/undici/issues/583#issuecomment-855384858
            const errBody = await body.text();
            this.#logger.trace(
                `HTTP ${statusCode} error catched by client. Body: ${errBody}`,
            );
            throw createError(statusCode);
        }

        if (
            (this.#throwOn500 || options.throwable) &&
            statusCode >= 500 &&
            statusCode <= 599
        ) {
            // Body must be consumed; https://github.com/nodejs/undici/issues/583#issuecomment-855384858
            const errBody = await body.text();
            this.#logger.trace(
                `HTTP ${statusCode} error catched by client. Body: ${errBody}`,
            );
            throw createError(statusCode);
        }

        return response;
    }

    /**
     * Perform an http request using the passed in options.
     * @param {HttpClientRequestOptions | Object} [options]
     * @returns {Promise<any>}
     */
    async request(options = {}) {
        return await this.#breaker.fire(options);
    }

    /**
     * Closes the http client and all it's connectsions.
     * @returns {Promise<void>}
     */
    async close() {
        await this.#breaker.close();
        if (!this.#agent.destroyed && !this.#agent.closed) {
            await this.#agent.close();
        }
    }
}
