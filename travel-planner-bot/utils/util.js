/**
 * A common emitter that is used by index.js and flightBookingDialog.js to track the click event on the payment
 * link
 */
var events = require('events');
var em = new events.EventEmitter();
module.exports.commonEmitter = em;

/**
 * @param element any value that is to be checked
 * @returns true -> if value is in json format otherwise false
 */
module.exports.isJson = (element) => {
    try {
        JSON.parse(element);
        return true;
    } catch (error) {
        return false;
    }
}