// © 2016-2018 Resurface Labs LLC

const chai = require('chai');
const expect = chai.expect;
const helper = require('./helper');

const resurfaceio = require('../lib/all');
const HttpLogger = resurfaceio.HttpLogger;
const HttpRules = resurfaceio.HttpRules;

/**
 * Tests against usage logger for HTTP/HTTPS protocol.
 */
describe('HttpLogger', () => {

    it('includes predefined rules', () => {
        expect(HttpLogger.defaultRules).to.equal(HttpRules.basicRules);
        try {
            HttpLogger.defaultRules = "include basic";
            let rules = HttpRules.parse(HttpLogger.defaultRules);
            expect(rules.length).to.equal(HttpRules.parse(HttpRules.basicRules).length);

            HttpLogger.defaultRules = "include basic\nsample 50";
            rules = HttpRules.parse(HttpLogger.defaultRules);
            expect(rules.length).to.equal(HttpRules.parse(HttpRules.basicRules).length + 1);
            expect(rules.filter(r => 'sample' === r.verb).length).to.equal(1);

            HttpLogger.defaultRules = '';
            expect(HttpLogger.defaultRules).to.equal('');
            expect(HttpRules.parse(HttpLogger.defaultRules).length).to.equal(0);

            HttpLogger.defaultRules = ' include default';
            expect(HttpLogger.defaultRules).to.equal('');

            HttpLogger.defaultRules = "include default\n";
            expect(HttpLogger.defaultRules).to.equal('');

            HttpLogger.defaultRules = " include default\ninclude default\n";
            expect(HttpRules.parse(HttpLogger.defaultRules).length).to.equal(0);

            HttpLogger.defaultRules = " include default\ninclude default\nsample 42";
            rules = HttpRules.parse(HttpLogger.defaultRules);
            expect(rules.length).to.equal(1);
            expect(rules.filter(r => 'sample' === r.verb).length).to.equal(1);
        } finally {
            HttpLogger.defaultRules = HttpRules.basicRules;
        }
    });

    it('overrides default rules', () => {
        expect(HttpLogger.defaultRules).to.equal(HttpRules.basicRules);
        try {
            let logger = new HttpLogger({url: "https://mysite.com"});
            expect(logger.rules).to.equal(HttpRules.basicRules);
            logger = new HttpLogger({url: "https://mysite.com", rules: '# 123'});
            expect(logger.rules).to.equal('# 123');

            HttpLogger.defaultRules = "";
            logger = new HttpLogger({url: "https://mysite.com"});
            expect(logger.rules).to.equal("");
            logger = new HttpLogger({url: "https://mysite.com", rules: ' sample 42'});
            expect(logger.rules).to.equal(' sample 42');

            HttpLogger.defaultRules = "skip_compression";
            logger = new HttpLogger({url: "https://mysite.com"});
            expect(logger.rules).to.equal("skip_compression");
            logger = new HttpLogger({url: "https://mysite.com", rules: 'include default\nskip_submission\n'});
            expect(logger.rules).to.equal("skip_compression\nskip_submission\n");

            HttpLogger.defaultRules = "sample 42\n";
            logger = new HttpLogger({url: "https://mysite.com"});
            expect(logger.rules).to.equal("sample 42\n");
            logger = new HttpLogger({url: "https://mysite.com", rules: 'include default\nskip_submission\n'});
            expect(logger.rules).to.equal("sample 42\n\nskip_submission\n");
        } finally {
            HttpLogger.defaultRules = HttpRules.basicRules;
        }
    });

    it('uses allow_http_url rules', () => {
        let logger = new HttpLogger("http://mysite.com");
        expect(logger.enableable).to.equal(false);
        logger = new HttpLogger({url: "http://mysite.com", rules: ""});
        expect(logger.enableable).to.equal(false);
        logger = new HttpLogger("https://mysite.com");
        expect(logger.enableable).to.equal(true);
        logger = new HttpLogger({url: "http://mysite.com", rules: "allow_http_url"});
        expect(logger.enableable).to.equal(true);
        logger = new HttpLogger({url: "http://mysite.com", rules: "allow_http_url\nallow_http_url"});
        expect(logger.enableable).to.equal(true);
    });

    it('uses copy_session_field rules', () => {
        const request = helper.mockRequestWithJson2();
        request.session['butterfly'] = 'poison';
        request.session['session_id'] = 'asdf1234';

        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: 'copy_session_field /.*/'});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"session_field:butterfly\",\"poison\"]");
        expect(queue[0]).to.contain("[\"session_field:session_id\",\"asdf1234\"]");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: 'copy_session_field /session_id/'});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"session_field:butterfly\",");
        expect(queue[0]).to.contain("[\"session_field:session_id\",\"asdf1234\"]");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: 'copy_session_field /blah/'});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"session_field:");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "copy_session_field /butterfly/\ncopy_session_field /session_id/"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"session_field:butterfly\",\"poison\"]");
        expect(queue[0]).to.contain("[\"session_field:session_id\",\"asdf1234\"]");
    });

    it('uses copy_session_field and remove rules', () => {
        const request = helper.mockRequestWithJson2();
        request.session['butterfly'] = 'poison';
        request.session['session_id'] = 'asdf1234';

        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: "copy_session_field !.*!\n!session_field:.*! remove"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"session_field:");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "copy_session_field !.*!\n!session_field:butterfly! remove"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"session_field:butterfly\",");
        expect(queue[0]).to.contain("[\"session_field:session_id\",\"asdf1234\"]");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "copy_session_field !.*!\n!session_field:.*! remove_if !poi.*!"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"session_field:butterfly\",");
        expect(queue[0]).to.contain("[\"session_field:session_id\",\"asdf1234\"]");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "copy_session_field !.*!\n!session_field:.*! remove_unless !sugar!"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"session_field:");
    });

    it('uses copy_session_field and stop rules', () => {
        const request = helper.mockRequestWithJson2();
        request.session['butterfly'] = 'poison';
        request.session['session_id'] = 'asdf1234';

        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: "copy_session_field !.*!\n!session_field:butterfly! stop"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "copy_session_field !.*!\n!session_field:butterfly! stop_if !poi.*!"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "copy_session_field !.*!\n!session_field:butterfly! stop_unless !sugar!"});
        logger.log(request, helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);
    });

    it('uses remove rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!.*! remove'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body! remove'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! remove'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body|response_body! remove'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_header:.*! remove'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"request_header:");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "!request_header:abc! remove\n!response_body! remove"});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"request_header:");
        expect(queue[0]).not.to.contain("[\"request_header:abc\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");
    });

    it('uses remove_if rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! remove_if !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!.*! remove_if !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body! remove_if !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! remove_if !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_if !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_if !.*blahblahblah.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "!request_body! remove_if !.*!\n!response_body! remove_if !.*!"});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");
    });

    it('uses remove_if_found rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! remove_if_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!.*! remove_if_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body! remove_if_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! remove_if_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_if_found !World!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_if_found !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_if_found !blahblahblah!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");
    });

    it('uses remove_unless rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! remove_unless !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!.*! remove_unless !.*blahblahblah.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body! remove_unless !.*blahblahblah.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! remove_unless !.*blahblahblah.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_unless !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_unless !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "!response_body! remove_unless !.*!\n!request_body! remove_unless !.*!"});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");
    });

    it('uses remove_unless_found rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! remove_unless_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!.*! remove_unless_found !blahblahblah!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body! remove_unless_found !blahblahblah!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! remove_unless_found !blahblahblah!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_unless_found !World!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_unless_found !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body|request_body! remove_unless_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",");
        expect(queue[0]).to.contain("[\"response_body\",");
    });

    it('uses replace rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_body! replace !blahblahblah!, !ZZZZZ!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("World");
        expect(queue[0]).not.to.contain("ZZZZZ");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! replace !World!, !Mundo!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>Hello Mundo!</html>\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body|response_body! replace !^.*!, !ZZZZZ!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",\"ZZZZZ\"],");
        expect(queue[0]).to.contain("[\"response_body\",\"ZZZZZ\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "!request_body! replace !^.*!, !QQ!\n!response_body! replace !^.*!, !SS!"});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"request_body\",\"QQ\"],");
        expect(queue[0]).to.contain("[\"response_body\",\"SS\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! replace !World!, !!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>Hello !</html>\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! replace !.*!, !!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).not.to.contain("[\"response_body\",");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! replace !World!, !Z!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML3, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>1 Z 2 Z Red Z Blue Z!</html>\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! replace !World!, !Z!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML4, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>1 Z\\n2 Z\\nRed Z \\nBlue Z!\\n</html>\"],");
    });

    it('uses replace rules with complex expressions', () => {
        let queue = [];
        let logger = new HttpLogger({
            queue: queue,
            rules: `/response_body/ replace /[a-zA-Z0-9.!#$%&’*+\\/=?^_\`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)/, /x@y.com/`
        });
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(),
            helper.MOCK_HTML.replace('World', 'rob@resurface.io'), helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>Hello x@y.com!</html>\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: `/response_body/ replace /[0-9\\.\\-\\/]{9,}/, /xyxy/`});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(),
            helper.MOCK_HTML.replace('World', '123-45-1343'), helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>Hello xyxy!</html>\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "!response_body! replace !World!, !<b>$&</b>!"});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>Hello <b>World</b>!</html>\"],");

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "!response_body! replace !(World)!, !<b>$1</b>!"});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>Hello <b>World</b>!</html>\"],");

        queue = [];
        logger = new HttpLogger({
            queue: queue, rules: "!response_body! replace !<input([^>]*)>([^<]*)</input>!, !<input$1></input>!"
        });
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML5, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
        expect(queue[0]).to.contain("[\"response_body\",\"<html>\\n<input type=\\\"hidden\\\"></input>\\n<input class='foo' type=\\\"hidden\\\"></input>\\n</html>\"],");
    });

    it('uses sample rules', () => {
        let queue = [];

        try {
            new HttpLogger({queue: queue, rules: 'sample 10\nsample 99'});
            expect(false).to.be.true;
        } catch (e) {
            expect(e.constructor.name).to.equal("EvalError");
            expect(e.message).to.equal("Multiple sample rules");
        }

        const logger = new HttpLogger({queue: queue, rules: 'sample 10'});
        for (let i = 1; i <= 100; i++) {
            logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml());
        }
        expect(queue.length).to.be.above(2);
        expect(queue.length).to.be.below(20);
    });

    it('uses skip_compression rules', () => {
        let logger = new HttpLogger("http://mysite.com");
        expect(logger.skip_compression).to.equal(false);
        logger = new HttpLogger({url: "http://mysite.com", rules: ""});
        expect(logger.skip_compression).to.equal(false);
        logger = new HttpLogger({url: "http://mysite.com", rules: "skip_compression"});
        expect(logger.skip_compression).to.equal(true);
    });

    it('uses skip_submission rules', () => {
        let logger = new HttpLogger("http://mysite.com");
        expect(logger.skip_submission).to.equal(false);
        logger = new HttpLogger({url: "http://mysite.com", rules: ""});
        expect(logger.skip_submission).to.equal(false);
        logger = new HttpLogger({url: "http://mysite.com", rules: "skip_submission"});
        expect(logger.skip_submission).to.equal(true);
    });

    it('uses stop rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! stop'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!.*! stop'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!request_body! stop'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), null, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: "!request_body! stop\n!response_body! stop"});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), null, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);
    });

    it('uses stop_if rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! stop_if !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_if !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_if !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_if !.*blahblahblah.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
    });

    it('uses stop_if_found rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! stop_if_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_if_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_if_found !World!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_if_found !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_if_found !blahblahblah!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, helper.MOCK_JSON);
        expect(queue.length).to.equal(1);
    });

    it('uses stop_unless rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! stop_unless !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_unless !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_unless !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_unless !.*blahblahblah.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(0);
    });

    it('uses stop_unless_found rules', () => {
        let queue = [];
        let logger = new HttpLogger({queue: queue, rules: '!response_header:blahblahblah! stop_unless_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(0);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_unless_found !.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_unless_found !World!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_unless_found !.*World.*!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(1);

        queue = [];
        logger = new HttpLogger({queue: queue, rules: '!response_body! stop_unless_found !blahblahblah!'});
        logger.log(helper.mockRequestWithJson2(), helper.mockResponseWithHtml(), helper.MOCK_HTML, null);
        expect(queue.length).to.equal(0);
    });

});
