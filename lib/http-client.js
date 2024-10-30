import { Agent, request } from 'undici';
import createError from 'http-errors';
import Opossum from 'opossum';
import abslog from 'abslog';

/**
 * @typedef HttpClientOptions
 * @property {Number} connections - @see https://undici.nodejs.org/#/docs/api/Pool?id=parameter-pooloptions
 * @property {Number} keepAliveMaxTimeout - @see https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions
 * @property {Number} keepAliveTimeout - @see https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions
 * @property {import('abslog')} logger - A logger instance compatible with abslog .
 * @property {Number} pipelining - @see https://undici.nodejs.org/#/?id=pipelining
 * @property {Number} reset - Circuit breaker: How long, in milliseconds, to wait before a tripped circuit should be reset.
 * @property {Boolean} throwOn400 - If the client should throw on http 400 errors. If true, http 400 errors will count against tripping the circuit.
 * @property {Boolean} throwOn500 - If the client should throw on http 500 errors. If true, http 500 errors will count against tripping the circuit.
 * @property {Number} threshold - Circuit breaker: How many, in %, requests should error before the circuit should trip. Ex; when 25% of requests fail, trip the circuit.
 * @property {Number} timeout - Circuit breaker: How long, in milliseconds, a request can maximum take. Requests exceeding this limit counts against tripping the circuit.
 * @property {Function} [fallaback=undefined] - Optional function to call as a fallback when breaker is open.
 **/

export default class HttpClient {
    #abortController;
    #agent;
    #breaker;
    #hasFallback = false;
    #logger;
    #throwOn400;
    #throwOn500;

    /**
     * @property {HttpClientOptions} options - options
     */
    constructor({
        abortController = undefined,
        autoRenewAbortController = false,
        connections = 50,
        fallback = undefined,
        keepAliveMaxTimeout = undefined,
        keepAliveTimeout = undefined,
        logger = undefined,
        pipelining = 10,
        reset = 20000,
        throwOn400 = false,
        throwOn500 = true,
        threshold = 25,
        timeout = 500,
    } = {}) {
        this.#logger = abslog(logger);
        this.#throwOn400 = throwOn400;
        this.#throwOn500 = throwOn500;

        this.#abortController = abortController;

        // TODO; Can we avoid bind here in a nice way?????
        this.#breaker = new Opossum(this.#request.bind(this), {
            ...(this.#abortController && {
                abortController: this.#abortController,
            }),
            ...(autoRenewAbortController && { autoRenewAbortController }),
            errorThresholdPercentage: threshold,
            resetTimeout: reset,
            timeout,
        });

        this.#agent = new Agent({
            keepAliveMaxTimeout, // TODO unknown option, consider removing
            keepAliveTimeout, // TODO unknown option, consider removing
            connections,
            pipelining, // TODO unknown option, consider removing
        });

        if (fallback) {
            this.#hasFallback = true;
            this.#fallback(fallback);
        }
    }

    async #request(options = {}) {
        const { statusCode, headers, trailers, body } = await request({
            ...options,
            dispatcher: new Agent({
                keepAliveTimeout: 10,
                keepAliveMaxTimeout: 10,
            }),
        });

        if (this.#throwOn400 && statusCode >= 400 && statusCode <= 499) {
            // Body must be consumed; https://github.com/nodejs/undici/issues/583#issuecomment-855384858
            const errBody = await body.text();
            this.#logger.trace(
                `HTTP ${statusCode} error catched by client. Body: ${errBody}`,
            );
            throw createError(statusCode);
        }

        if (this.#throwOn500 && statusCode >= 500 && statusCode <= 599) {
            // Body must be consumed; https://github.com/nodejs/undici/issues/583#issuecomment-855384858
            await body.text();
            const errBody = await body.text();
            this.#logger.trace(
                `HTTP ${statusCode} error catched by client. Body: ${errBody}`,
            );
            throw createError(statusCode);
        }

        return {
            statusCode,
            headers,
            trailers,
            body,
        };
    }

    /**
     * Function called if the request fails.
     * @param {import('opossum')} func
     */
    #fallback(func) {
        this.#breaker.fallback(func);
    }

    /**
     * Requests a URL.
     * @param {any} [options]
     * @returns {Promise<any>}
     */
    async request(options = {}) {
        try {
            return await this.#breaker.fire(options);
        } catch (error) {
            if (!this.#hasFallback) {
                throw new HttpClientError(
                    `Error on ${options.method} ${options.origin}${options.path}`,
                    {
                        code: error.code,
                        cause: error,
                        options,
                    },
                );
            }
        }
    }

    /**
     * Closes the client.
     * @returns {Promise<void>}
     */
    async close() {
        await this.#breaker.close();
        if (!this.#agent.destroyed && !this.#agent.closed) {
            await this.#agent.close();
        }
    }
}

/**
 * Error class for the client
 */
export class HttpClientError extends Error {
    static ServerDown = 'EOPENBREAKER';
    constructor(message, { code, cause, options }) {
        super(message);
        this.name = 'HttpClientError';
        this.code = code;
        this.cause = cause;
        this.options = options;
    }
}
