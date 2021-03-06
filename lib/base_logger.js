// Code Review - Chris Anderson 2020-09-24
/**
 * ! Nitpicking is turned up to 11 in this code review, just so we have
 * ! something to talk about. I'm not sure that this level of OCD would
 * ! be productive in a team environment. 
 * 
 * ! I'm also not super familiar with the product or codebase, so certain
 * ! comments might be a bit off-base. 
 */
// © 2016-2020 Resurface Labs Inc.

const crypto = require('crypto')
const http = require('http');
const https = require('https');
const os = require('os');
const urls = require('url');
const usage_loggers = require('./usage_loggers');
const zlib = require('zlib');

/**
 * Basic usage logger to embed or extend.
 */
class BaseLogger {

    /**
     * Initialize logger.
     */
    constructor(agent, options = {}) {
        this._agent = agent;
        this._host = BaseLogger.host_lookup();
        this._metadata_id = crypto.randomBytes(16).toString('hex');
        this._queue = null;
        this._skip_compression = false;
        this._skip_submission = false;
        this._url = null;
        this._version = BaseLogger.version_lookup();

        // read provided options
        // ! (Code Review) it seems like these var_exists variables are only being used
        // ! once. It seems like the conditionals could just be done in-place instead.
        // ! especially since not all of them are even going to be accessed.
        const enabled = options['enabled'];
        const enabled_exists = (typeof enabled === 'boolean');
        const queue = options['queue'];
        const queue_exists = (typeof queue === 'object') && Array.isArray(queue);
        const url = (typeof options === 'string') ? options : options['url'];
        const url_exists = (typeof url === 'string');

        // set options in priority order
        /**
         * ! (Code Review) If `enabled` should default to true, maybe that should be
         * ! specified on its declaration instead of with this statement to make that
         * ! more obvious.
         */
        this._enabled = !enabled_exists || (enabled_exists && enabled === true);
        if (queue_exists) {
            this._queue = queue;
        } else if (url_exists) {
            this._url = url;
        } else {
            this._url = usage_loggers.urlByDefault();
            // ! (Code Review) Could we use url_exists on this line?
            this._enabled = (typeof this._url === 'string') && (this._url.length > 0);
        }

        // validate url when present
        // ! (Code Review) Maybe we could go ahead and use this logic with url_exists and change it to url_valid
        if (typeof this._url === 'undefined' || ((this._url !== null) && !BaseLogger.valid_url(this._url))) {
            this._url = null;
            this._enabled = false;
        }

        // parse and cache url properties
        // ! (Code Review) Could use url_valid here to prevent confusion as to why url might be null
        if (this._url != null) {
            try {
                const target = urls.parse(this._url);
                this._url_library = target.protocol === 'https' ? https : http;
                this._url_options = {
                    host: target.host.split(':')[0],
                    port: target.port,
                    path: target.path,
                    method: 'POST',
                    headers: {
                        'Content-Encoding': this._skip_compression ? 'identity' : 'deflated',
                        'Content-Type': 'application/json; charset=UTF-8'
                    }
                };
            } catch (e) {
                // ! (Code Review) If this breaks, is there something we could do to alert
                // ! the user beyond simply disabling the logger?
                this._url = null;
                this._url_library = null;
                this._url_options = null;
                this._enabled = false;
            }
        }

        // finalize internal properties
        // ! (Code Review) Why isn't this using queue_exists or url_exists (or url_valid)?
        this._enableable = (this._queue !== null) || (this._url !== null);
        this._submit_failures = new Uint32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
        this._submit_successes = new Uint32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

        // mark immutable properties
        // ! (Code Review) Not specifically a critique of this code, just want to note
        // ! that this block, and much of the type checking logic I've seen so far, would
        // ! be much easier to implement and understand with TypeScript. 
        Object.defineProperty(this, '_agent', {configurable: false, writable: false});
        Object.defineProperty(this, '_host', {configurable: false, writable: false});
        Object.defineProperty(this, '_metadata_id', {configurable: false, writable: false});
        Object.defineProperty(this, '_queue', {configurable: false, writable: false});
        Object.defineProperty(this, '_submit_failures', {configurable: false, writable: false});
        Object.defineProperty(this, '_submit_successes', {configurable: false, writable: false});
        Object.defineProperty(this, '_url', {configurable: false, writable: false});
        Object.defineProperty(this, '_url_library', {configurable: false, writable: false});
        Object.defineProperty(this, '_url_options', {configurable: false, writable: false});
        Object.defineProperty(this, '_version', {configurable: false, writable: false});
    }

    /**
     * Returns agent string identifying this logger.
     */
    get agent() {
        return this._agent;
    }

    /**
     * Disable this logger.
     */
    disable() {
        this._enabled = false;
        return this;
    }

    /**
     * Enable this logger.
     */
    enable() {
        this._enabled = this._enableable;
        return this;
    }

    /**
     * Returns true if this logger can ever be enabled.
     */
    get enableable() {
        return this._enableable;
    }

    /**
     * Returns true if this logger is currently enabled.
     */
    get enabled() {
        return this._enableable && this._enabled && usage_loggers.enabled;
    }

    /**
     * Returns cached host identifier.
     */
    get host() {
        return this._host;
    }

    /**
     * Returns high-resolution time in milliseconds.
     */
    get hrmillis() {
        const [seconds, nanos] = process.hrtime();
        return seconds * 1000 + nanos / 1000000;
    }

    /**
     * Returns metadata id hash.
     */
    get metadata_id() {
        return this._metadata_id;
    }

    /**
     * Returns queue destination where messages are sent.
     */
    get queue() {
        return this._queue;
    }

    /**
     * Returns true if message compression is being skipped.
     */
    get skip_compression() {
        return this._skip_compression;
    }

    /**
     * Sets if message compression will be skipped.
     */
    set skip_compression(value) {
        this._skip_compression = value;
    }

    /**
     * Returns true if message submission is being skipped.
     */
    get skip_submission() {
        return this._skip_submission;
    }

    /**
     * Sets if message submission will be skipped.
     */
    set skip_submission(value) {
        this._skip_submission = value;
    }

    /**
     * Returns promise to submit JSON message to intended destination.
     */
    submit(msg) {
        // ! (Code Review) ===?
        if (msg == null || this._skip_submission || !this.enabled) {
            // ! (Code Review) Can leave out `reject`
            return new Promise((resolve, reject) => resolve(true));
        // ! (Code Review) Should any of the below code still run if the logger is not enabled?
        } else if (this._queue !== null) {
            this._queue.push(msg);
            Atomics.add(this._submit_successes, 0, 1);
            // ! (Code Review) Can leave out `reject`
            return new Promise((resolve, reject) => resolve(true));
        } else {
            // ! (Code Review) Can leave out `reject`
            return new Promise((resolve, reject) => {
                try {
                    const request = this._url_library.request(this._url_options, (response) => {
                        if (response.statusCode === 204) {
                            Atomics.add(this._submit_successes, 0, 1);
                            resolve(true);
                        } else {
                            Atomics.add(this._submit_failures, 0, 1);
                            resolve(true);
                        }
                    });
                    request.on('error', () => {
                        Atomics.add(this._submit_failures, 0, 1);
                        resolve(true);
                    });
                    if (this._skip_compression) {
                        request.write(msg);
                        request.end();
                    } else {
                        zlib.deflate(msg, function (err, buffer) {
                            request.write(buffer);
                            request.end();
                        });
                    }
                } catch (e) {
                    Atomics.add(this._submit_failures, 0, 1);
                    resolve(true);
                }
            });
        }
    }

    /**
     * Returns count of submissions that failed.
     */
    get submit_failures() {
        return Atomics.load(this._submit_failures, 0);
    }

    /**
     * Returns count of submissions that succeeded.
     */
    get submit_successes() {
        return Atomics.load(this._submit_successes, 0);
    }

    /**
     * Returns url destination where messages are sent.
     */
    get url() {
        return this._url;
    }

    /**
     * Checks if provided value is a valid URL string.
     * Copied from https://github.com/ogt/valid-url/blob/8d1fc52b21ceab99b68f415838035859b7237949/index.js#L22
     */
    static valid_url(value) {
        if (!value) return;

        // check for illegal characters
        if (/[^a-z0-9\:\/\?\#\[\]\@\!\$\&\'\(\)\*\+\,\;\=\.\-\_\~\%]/i.test(value)) return;

        // check for hex escapes that aren't complete
        if (/%[^0-9a-f]/i.test(value)) return;
        if (/%[0-9a-f](:?[^0-9a-f]|$)/i.test(value)) return;

        // from RFC 3986
        let splitted = value.match(/(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?/);
        let scheme = splitted[1];
        let authority = splitted[2];
        let path = splitted[3];
        let query = splitted[4];
        let fragment = splitted[5];
        let out = '';

        // scheme and path are required, though the path can be empty
        if (!(scheme && scheme.length && path.length >= 0)) return;

        // if authority is present, the path must be empty or begin with a /
        if (authority && authority.length) {
            if (!(path.length === 0 || /^\//.test(path))) return;
        } else {
            // if authority is not present, the path must not start with //
            if (/^\/\//.test(path)) return;
        }

        // scheme must begin with a letter, then consist of letters, digits, +, ., or -
        if (!/^[a-z][a-z0-9\+\-\.]*$/.test(scheme.toLowerCase())) return;

        // re-assemble the URL per section 5.3 in RFC 3986
        out += scheme + ':';
        if (authority && authority.length) {
            out += '//' + authority;
        }
        out += path;
        if (query && query.length) out += '?' + query;
        if (fragment && fragment.length) out += '#' + fragment;
        return out;
    }

    /**
     * Returns cached version number.
     */
    get version() {
        return this._version;
    }

    /**
     * Retrieves host identifier.
     */
    static host_lookup() {
        const dyno = process.env.DYNO;
        if (typeof dyno !== 'undefined') return dyno;
        try {
            return os.hostname();
        } catch (e) {
            return 'unknown';
        }
    }

    /**
     * Retrieves version number from package file.
     */
    static version_lookup() {
        return require('../package.json').version;
    }

}

module.exports = BaseLogger;
