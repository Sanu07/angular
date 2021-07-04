const { MessageFactory, CardFactory, ActivityTypes } = require('botbuilder');
const { WaterfallDialog, ConfirmPrompt, ChoicePrompt, ChoiceFactory, ListStyle, TextPrompt, DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');

const { RoomBookingDialog } = require('./roomBookingDialog');
const SelectCityCard = require('../resources/adaptiveCards/SelectCityCard');
const SelectDateCard = require('../resources/adaptiveCards/SelectDateCard');
const FlightBookingConfirmationCard = require('../resources/adaptiveCards/FlightBookingConfirmationCard');
const { CancelBookingDialog } = require('./cancelBookingDialog');

const path = require('path');
fs = require('fs');
const moment = require('moment');
const common = require('../utils/util');
var commonEmitter = common.commonEmitter;

const TEXT_PROMPT = 'TEXT_PROMPT';
const SEAT_SELECT_TEXT_PROMPT = 'SEAT_SELECT_TEXT_PROMPT';
const DATE_TEXT_PROMPT = 'DATE_TEXT_PROMPT';
const FLIGHT_BOOKING_DIALOG = 'FLIGHT_BOOKING_DIALOG';
const CONFIRM_PROMPT = 'CONFIRM_PROMPT';
const CHOICE_PROMPT = 'CHOICE_PROMPT';
const selectOptionsDateStep = ['Change Date', 'Change Destination', 'Start Over'];
var endDialog = false;

class FlightBookingDialog extends CancelBookingDialog {

    constructor(conversationState, userState) {

        super('flightBookingDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT));
        this.addDialog(new TextPrompt(SEAT_SELECT_TEXT_PROMPT, this.seatBookingValidator));
        this.addDialog(new TextPrompt(DATE_TEXT_PROMPT, this.bookingDateValidator));
        this.addDialog(new ConfirmPrompt(CONFIRM_PROMPT));
        this.addDialog(new ChoicePrompt(CHOICE_PROMPT));
        this.addDialog(new RoomBookingDialog(conversationState, userState));

        this.addDialog(new WaterfallDialog(FLIGHT_BOOKING_DIALOG, [
            this.originStep.bind(this),
            this.destinationStep.bind(this),
            this.dateStep.bind(this),
            this.travellingClassStep.bind(this),
            this.seatBookingConfirmStep.bind(this),
            this.seatSelectStep.bind(this),
            this.paymentStep.bind(this),
            this.summaryStep.bind(this),
            this.finalStep.bind(this),
        ]));

        this.initialDialogId = FLIGHT_BOOKING_DIALOG;
        this.conversationState = conversationState;
        this.flightBookingData = this.conversationState.createProperty('flightBookingData');
    }

    async run(turnContext, accessor, entities) {
        const dialogSet = new DialogSet(accessor);
        dialogSet.add(this);

        const dialogContext = await dialogSet.createContext(turnContext);
        const results = await dialogContext.continueDialog();
        if (results.status === DialogTurnStatus.empty) {
            await dialogContext.beginDialog(this.id, entities);
        } else if (results.status === DialogTurnStatus.complete) {
            endDialog = true;
        }
    }

    async originStep(step) {
        endDialog = false;
        // this part executes when beginDialog/replaceDialog is called from any step but this particular step is not intended.
        // At that time, the value for the origin as provided by the user is saved again and the next step is called
        if ((step.options.customIndex && step.options.customIndex !== step.index)
            || step.values.origin) {
            step.values.origin = step.options.origin;
            return await step.continueDialog();
        }
        // this part executes if value comes from LUIS entities
        if (step._info.options.origin) {
            step.values.origin = step._info.options.origin[0];
            return await step.continueDialog();
        }
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectCityCard).replace('${title}', 'What\'s the origin of flight?')))]
        });
        return await step.prompt(TEXT_PROMPT, '');
    }

    async destinationStep(step) {
        endDialog = false;
        if (!step.values.origin) {
            if (common.isJson(step.result)) {
                const origin = JSON.parse(step.result).place;
                step.values.origin = origin.charAt(0).toUpperCase() + origin.slice(1).toLowerCase();
            } else {
                step.values.origin = step.result;
            }
        }
        // this part executes when beginDialog/replaceDialog is called from any step but this particular step is not intended.
        // At that time, the value for the destination as provided by the user is saved again and the next step is called
        if ((step.options.customIndex && step.options.customIndex !== step.index)
            || step.values.destination) {
            step.values.destination = step.options.destination;
            return await step.continueDialog();
        }
        // this part executes if value comes from LUIS entities
        if (step._info.options.destination) {
            step.values.destination = step._info.options.destination[0];
            return await step.continueDialog();
        }
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectCityCard).replace('${title}', 'What\'s the destination of flight?')))]
        });
        return await step.prompt(TEXT_PROMPT, '');
    }

    async dateStep(step) {
        endDialog = false;
        if (!step.values.destination) {
            if (common.isJson(step.result)) {
                const dest = JSON.parse(step.result).place;
                step.values.destination = dest.charAt(0).toUpperCase() + dest.slice(1).toLowerCase();
            } else {
                step.values.destination = step.result;
            }
        }
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectDateCard)
                    .replace('${title}', 'For when you want to book flight?')
                    .replace('${today}', moment(new Date()).format("DD/MM/YYYY"))
                    .replace('${tomorrow}', moment().add(1, 'days').format("DD/MM/YYYY"))
            ))]
        });
        return await step.prompt(DATE_TEXT_PROMPT, '');
    }

    async travellingClassStep(step) {
        endDialog = false;
        if (selectOptionsDateStep.indexOf(step.result) > -1) {
            switch (step.result) {
                case 'Start Over':
                    return await step.replaceDialog('flightBookingDialog', { customIndex: 0 });
                case 'Change Destination':
                    return await step.replaceDialog('flightBookingDialog', { customIndex: 1, origin: step.values.origin });
                case 'Change Date':
                    return await step.replaceDialog('flightBookingDialog',
                        { customIndex: 2, origin: step.values.origin, destination: step.values.destination });
            }
        }
        const value = common.isJson(step.result) ? moment(JSON.parse(step.result).date, 'YYYY-MM-DD') :
            moment(step.result, 'DD-MM-YYYY');
        step.values.bookingDate = moment(value).startOf('day').format('DD-MMMM-YYYY');
        return await step.prompt(CHOICE_PROMPT, {
            prompt: 'Which class you want to travel?',
            choices: ChoiceFactory.toChoices(['Economy', 'Business', 'Change Destination', 'Start Over']),
            style: ListStyle.heroCard
        });
    }

    async seatBookingConfirmStep(step) {
        endDialog = false;
        step.values.travellingClass = step.result.value;
        switch (step.result.value) {
            case 'Start Over':
                return await step.replaceDialog('flightBookingDialog', { customIndex: 0 });
            case 'Change Destination':
                return await step.replaceDialog('flightBookingDialog', { customIndex: 1, origin: step.values.origin });
        }
        return await step.prompt(CONFIRM_PROMPT, 'Do you want to select seat?', ['Yes', 'No']);
    }

    async seatSelectStep(step) {
        endDialog = false;
        if (step.result) {
            const message = "_**Awesome**_, please select your seat for flight from **" + step.values.origin + "** to **"
                + step.values.destination + "** for **" + step.values.travellingClass + "** class ";
            await step.context.sendActivity({
                text: message,
                attachments: [this.getSeatArrangementAttachment()]
            });
            return await step.prompt(SEAT_SELECT_TEXT_PROMPT, '');
        } else {
            return await step.continueDialog();
        }
    }

    async paymentStep(step) {
        endDialog = false;
        step.values.seat = step.result.toUpperCase() === 'NO' ? '--' : step.result.toUpperCase();
        // this message is created with a link that hits back to the same running node server
        // so as to track whether the payment link has been clicked or not
        const message = 'Please complete payment by clicking [here](http://localhost:3978/pay)';
        await step.context.sendActivity(message);
        try {
            await new Promise(resolve => {
                commonEmitter.on('paymentURL_clicked_event', async function handler() {
                    await step.context.sendActivity({ type: ActivityTypes.Typing });
                    resolve(commonEmitter.removeListener('paymentURL_clicked_event', handler));
                });
            });
        } catch (error) { }
        await new Promise(resolve => setTimeout(resolve, 10000));
        return await step.continueDialog();
    }

    async summaryStep(step) {
        endDialog = false;
        step.values.payment = step.result;
        const bookingID = new Date().getTime();
        await step.context.sendActivities([
            { type: 'message', text: '**Thank you for your payment!** Your tickets have been booked and your _booking ID_ is **FL' + bookingID + '**' },
            {
                type: 'message',
                attachments: [CardFactory.adaptiveCard(JSON.parse(
                    JSON.stringify(FlightBookingConfirmationCard)
                        .replace('${bookingID}', 'FL' + bookingID)
                        .replace('${scheduledDate}', step.values.bookingDate)
                        .replace('${origin}', step.values.origin)
                        .replace('${destination}', step.values.destination)
                        .replace('${origin_short}', step.values.origin.substring(0, 3).toUpperCase())
                        .replace('${destination_short}', step.values.destination.substring(0, 3).toUpperCase())
                        .replace('${travellingClass}', step.values.travellingClass)
                        .replace('${seat}', step.values.seat || '-')
                ))]
            }
        ]);
        return await step.prompt(CONFIRM_PROMPT, 'Do you want to book hotel room also?', ['Yes', 'No']);
    }

    /**
     * This final step is required to populate the conversationData/DialogData with the flight booking details
     * which might be required for roomBookingDialog
     */
    async finalStep(step) {
        if (step.result) {
            return await step.replaceDialog('roomBookingDialog',
                {
                    destination: step.values.destination,
                    bookingDate: step.values.bookingDate,
                    customIndex: 3
                });
        } else {
            await this.flightBookingData.set(step.context,
                {
                    destination: step.values.destination,
                    bookingDate: step.values.bookingDate,
                    accessTime: new Date()
                });
        }
        endDialog = true;
        return await step.endDialog();
    }

    async isDialogComplete() {
        return endDialog;
    }

    async bookingDateValidator(promptContext) {
        if (!promptContext.recognized.succeeded) return false;
        var value = promptContext.recognized.value;
        if (promptContext.attemptCount > 1 && selectOptionsDateStep.indexOf(value) > -1) {
            return true;
        }
        // the user has a provision to input 'today' or 'tomorrow'
        if (value === 'today' || value === 'tomorrow') {
            value = value === 'today' ? moment() : moment().add(1, 'days');
        } else {
            value = common.isJson(value) ? moment(JSON.parse(value).date, 'YYYY-MM-DD') :
                moment(value, 'DD-MM-YYYY');
        }
        // the date input should be valid future date. If date provided is of 'today', the value is passed
        // so as to provide the user with different error message in the next if block
        if (!moment(value).isValid() || moment(value).startOf('day').isBefore(moment(new Date()).startOf('day'))) {
            await promptContext.context.sendActivity('Please enter a **valid future** date in format (DD-MM-YYYY). (e.g **' + moment(new Date()).add(1, 'days').format('DD-MM-YYYY') + '**) for **' + moment(new Date()).add(1, 'days').format('DD-MMMM-YYYY') + '**');
            await promptContext.context.sendActivity(MessageFactory.suggestedActions(selectOptionsDateStep, ''));
            return false;
        }
        // if date is for today required message is shown
        if (moment(value).startOf('day').isSame(moment(new Date()).startOf('day'))) {
            await promptContext.context.sendActivity('No Flights are available for today.');
            await promptContext.context.sendActivity(MessageFactory.suggestedActions(selectOptionsDateStep, ''));
            return false;
        }
        return true;
    }

    async seatBookingValidator(promptContext) {
        if (!promptContext.recognized.succeeded) return false;
        // A regex to validate the seat number
        const regexExp = /[a-c]{1}[1-6]{1}/ig;
        if (!regexExp.test(promptContext.recognized.value)) {
            await promptContext.context.sendActivity({
                text: 'Please select a seat from the image. (e.g **_A1_ _B4_ _C6_**)'
            });
            return false;
        }
        return true;
    }

    getSeatArrangementAttachment() {
        const imageData = fs.readFileSync(path.join(__dirname, '../resources/images/seats.png'));
        const base64Image = Buffer.from(imageData).toString('base64');

        return {
            name: 'seats.png',
            contentType: 'image/png',
            contentUrl: `data:image/png;base64,${base64Image}`
        };
    }
}

module.exports.FlightBookingDialog = FlightBookingDialog;