var events = require('events');
var em = new events.EventEmitter();
module.exports.commonEmitter = em;

module.exports.isJson = (element) => {
    try {
        JSON.parse(element);
        return true;
    } catch (error) {
        return false;
    }
}