# @podium/http-client

⚠️ This project is still work in progress, should not be used for anything just yet.

Generic http client built on [undici] with a circuit breaker using [opossum], error handling and metrics out of the box.

[![GitHub Actions status](https://github.com/podium-lib/http-client/workflows/Run%20Lint%20and%20Tests/badge.svg)](https://github.com/podium-lib/layout/actions?query=workflow%3A%22Run+Lint+and+Tests%22)
[![Known Vulnerabilities](https://snyk.io/test/github/podium-lib/http-client/badge.svg)](https://snyk.io/test/github/podium-lib/http-client)

## Documentation
 - [Installing](#installation)
 - [Usage](#usage)
 - [API](#api)
   - [Methods](#methods)
   - [Metrics](#metrics)

## Installation

*Note!* Requires Node.js v20 or later.

```bash
npm install @podium/http-client
```

## Usage

```js
import client from '@podium/http-client';
const client = new HttpClient(options);

const response = await client.request({ path: '/', origin: 'https://host.domain' })
if (response.ok) {
    //
}
```

### Aborting requests

```js
import client from '@podium/http-client';
const client = new HttpClient(options);

const controller = new AbortController();
const response = await client.request({
    path: '/',
    origin: 'https://host.domain',
    signal: controller.signal
});
// Abort the request.
controller.abort();
```

## API

### Constructor

```js
import client from '@podium/http-client';

const client = new HttpClient(options);
```

#### options

| option              | default      | type       | required | details                                                                                                                                    |
|---------------------|--------------|------------|----------|--------------------------------------------------------------------------------------------------------------------------------------------|
| clientName          | `''`         | `string`   | no       | Client name                                                                                                                                |
| connections         | `50`         | `number`   | no       | See [connections](#connections)                                                                                                            |
| fallback            | `undefined`  | `function` | no       | Function to call when requests fail, see [fallback](#fallback)                                                                             |
| followRedirects     | `false`      | `boolean`  | no       | Flag for whether to follow redirects or not, see [followRedirects](#followRedirects).                                                      |
| keepAliveMaxTimeout | `undefined`  | `number`   | no       | See [keepAliveMaxTimeout](#keepAliveMaxTimeout)                                                                                            |
| keepAliveTimeout    | `undefined`  | `number`   | no       | See [keepAliveTimeout](#keepAliveTimeout)                                                                                                  |
| logger              | `undefined ` | `object`   | no       | A logger which conform to a log4j interface                                                                                                |
| pipelining          | `10`         | `number`   | no       | See [pipelining](#pipelining)                                                                                                              |
| reset               | `2000`       | `number`   | no       | Circuit breaker: How long, in milliseconds, to wait before a tripped circuit should be reset.                                              |
| threshold           | `25`         | `number`   | no       | Circuit breaker: How many, in %, requests should error before the circuit should trip. Ex; when 25% of requests fail, trip the circuit.    |
| throwOn400          | `false`      | `boolean`  | no       | If the client should throw on HTTP 400 errors.If true, HTTP 400 errors will counts against tripping the circuit.                           |
| throwOn500          | `true`       | `boolean`  | no       | If the client should throw on HTTP 500 errors.If true, HTTP 500 errors will counts against tripping the circuit.                           |
| timeout             | `500`        | `number`   | no       | Circuit breaker: How long, in milliseconds, a request can maximum take. Requests exceeding this limit counts against tripping the circuit. |


##### connections

Property is sent to the underlying http library.
See library docs on [connections](https://undici.nodejs.org/#/docs/api/Pool?id=parameter-pooloptions)

##### fallback

Optional function to run when a request fails.

```js
// TBA
```

##### followRedirects

TODO!!!   decide what to do with the redirects stuff...

By default, the library does not follow redirect.
If set to true it will follow redirects according to `maxRedirections`.
It will by default throw on reaching `throwOnMaxRedirects`


##### keepAliveMaxTimeout

Property is sent to the underlying http library.
See library docs on [keepAliveTimeout](https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions)

##### keepAliveMaxTimeout

Property is sent to the underlying http library.
See library docs on [keepAliveMaxTimeout](https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions)

##### logger

Any log4j compatible logger can be passed in and will be used for logging.
Console is also supported for easy test / development.

Example:

```js
const layout = new Layout({
    name: 'myLayout',
    pathname: '/foo',
    logger: console,
});
```

Under the hood [abslog] is used to abstract out logging. Please see [abslog] for
further details.

##### pipelining

Property is sent to the underlying http library.
See library docs on [pipelining](https://undici.nodejs.org/#/?id=pipelining)

##### reset
Circuit breaker: How long, in milliseconds, to wait before a tripped circuit should be reset.

##### threshold

Circuit breaker: How many, in %, requests should error before the circuit should trip. Ex; when 25% of requests fail, trip the circuit.

##### timeout
Circuit breaker: How long, in milliseconds, a request can maximum take. Requests exceeding this limit counts against tripping the circuit.

##### throwOn400

If the client should throw on http 400 errors. If true, http 400 errors will count against tripping the circuit.

##### throwOn500
If the client should throw on http 500 errors. If true, http 500 errors will count against tripping the circuit.

### Methods

#### async request(options = {})

Sends a request using the passed in options object.

| name         | type            | description                                     |
|--------------|-----------------|-------------------------------------------------|
| headers      | `object`        | Object with key / value which are strings       |
| method       | `string`        | HTTP method name                                |
| origin       | `string \| URL` | Request origin, ex `https://server.domain:9090` |
| path         | `string`        | URL path, ex `/foo`                             |
| query        | `object`        | Object with key / value which are strings       |
| redirectable | `boolean`       | If we should follow redirects or not.           |
| signal       | `AbortSignal`   | Abort signal for canceling requests.            |
| throwable    | `boolean`       | If we should throw on errors.                   |

For a complete list of options, consult the [undici documentation](https://undici.nodejs.org/#/?id=undicirequesturl-options-promise).

#### async close()

Closes the client and it's connections.

### Metrics

The expose metrics on the circuit breaking behaviour.

| name                         | type    | description                                                                               |
|------------------------------|---------|-------------------------------------------------------------------------------------------|
| `http_client_breaker_events` | counter | Counters on events exposed by the circuit breaker library,<br/>see  [opossum] for details |


[@metrics/metric]: https://github.com/metrics-js/metric '@metrics/metric'
[abslog]: https://github.com/trygve-lie/abslog 'abslog'
[undici]: https://undici.nodejs.org/
[opossum]: https://github.com/nodeshift/opossum/
