import HttpClient from '../lib/http-client.js';
const url = 'https://jsonplaceholder.typicode.com/todos/1';

const controller = new AbortController();
const signal = controller.signal;

const fetchTodo = async () => {
    try {
        const client = new HttpClient({
            timeout: 10000,
            abortController: controller,
        });
        const u = new URL(url);
        client.request({
            origin: u.origin,
            path: u.pathname,
            signal,
        });
        // eslint-disable-next-line no-unused-vars
    } catch (e) {
        console.log('e');
    }
};

fetchTodo();

controller.abort();
