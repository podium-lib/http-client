import HttpClient from '../lib/http-client.js';

const client = new HttpClient();
const response = await client.request({
    origin: 'https://www.google.com',
    path: '/',
    method: 'GET',
    maxRedirections: 0,
});

console.log(response.statusCode);
