const { WaterfallDialog, ComponentDialog, ChoiceFactory, ListStyle, Recognizer } = require('botbuilder-dialogs');
const { MessageFactory, CardFactory, AttachmentLayoutTypes, ActivityTypes } = require('botbuilder');
const path = require('path');
const { RoomBookingDialog } = require('./roomBookingDialog');
const Recognizers = require('@microsoft/recognizers-text-date-time');
fs = require('fs');
const moment = require('moment');

const { ConfirmPrompt, ChoicePrompt, DateTimePrompt, NumberPrompt, TextPrompt } = require('botbuilder-dialogs');

const { DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');

const SelectCityCard = require('../resources/adaptiveCards/SelectCityCard');
const SelectDateCard = require('../resources/adaptiveCards/SelectDateCard');
const FlightBookingConfirmationCard = require('../resources/adaptiveCards/FlightBookingConfirmationCard');
const { CancelBookingDialog } = require('./cancelBookingDialog');

const TEXT_PROMPT = 'TEXT_PROMPT';
const SEAT_SELECT_TEXT_PROMPT = 'SEAT_SELECT_TEXT_PROMPT';
const DATETIME_TEXT_PROMPT = 'DATETIME_TEXT_PROMPT';
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
        this.addDialog(new TextPrompt(DATETIME_TEXT_PROMPT, this.bookingDateValidator));
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
        step.values.origin = step._info.options.origin && step._info.options.origin[0];
        if ((step.options.customIndex && step.options.customIndex !== step.index)
            || step.values.origin) {
            step.values.origin = step.options.origin;
            return await step.continueDialog();
        }
        console.log('origin-step');
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectCityCard).replace('${title}', 'What\'s the origin of flight?')))]
        });
        return await step.prompt(TEXT_PROMPT, {
            prompt: '',
            retryPrompt: 'error'
        });
        // return await step.prompt(TEXT_PROMPT, 
        //    'Please complete payment by clicking [HERE](https://www.google.com/).'
        // );
    }

    async destinationStep(step) {
        endDialog = false;
        console.log('destination-step');
        if (!step.values.origin) {
            if (this.isJson(step.result)) {
                const origin = JSON.parse(step.result).place;
                step.values.origin = origin.charAt(0).toUpperCase() + origin.slice(1);
            } else {
                step.values.origin = step.result;
            }
        }
        step.values.destination = step._info.options.destination && step._info.options.destination[0];
        if ((step.options.customIndex && step.options.customIndex !== step.index)
            || step.values.destination) {
            step.values.destination = step.options.destination;
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
        console.log('date-step');
        if (!step.values.destination) {
            if (this.isJson(step.result)) {
                const dest = JSON.parse(step.result).place;
                step.values.destination = dest.charAt(0).toUpperCase() + dest.slice(1);
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
        return await step.prompt(DATETIME_TEXT_PROMPT, {
            prompt: '',
            retryPrompt: ''
        });
    }

    async travellingClassStep(step) {
        endDialog = false;
        var value = step.result;
        if (selectOptionsDateStep.indexOf(value) > -1) {
            switch (value) {
                case 'Start Over':
                    return await step.replaceDialog('flightBookingDialog', { customIndex: 0 });
                case 'Change Destination':
                    return await step.replaceDialog('flightBookingDialog', { customIndex: 1, origin: step.values.origin });
                case 'Change Date':
                    return await step.replaceDialog('flightBookingDialog',
                        { customIndex: 2, origin: step.values.origin, destination: step.values.destination });
            }
        }
        value = Recognizers.recognizeDateTime(value, 'en-US');
        step.values.bookingDate = moment(value[0].resolution.values[0].value, 'YYYY-MM-DD').startOf('day').format('DD-MMMM-YYYY');
        console.log('travelling-step');
        return await step.prompt(CHOICE_PROMPT, {
            prompt: 'Which class you want to travel?',
            choices: ChoiceFactory.toChoices(['Economy', 'Business', 'Change Destination', 'Start Over']),
            retryPrompt: 'Please choose exact options.',
            style: ListStyle.heroCard
        });
    }

    async seatBookingConfirmStep(step) {
        endDialog = false;
        step.values.travellingClass = step.result.value;
        switch (step.result.value) {
            case 'Start Over':
                return await step.beginDialog('flightBookingDialog', { customIndex: 0 });
            case 'Change Destination':
                return await step.beginDialog('flightBookingDialog', { customIndex: 1 });
        }
        console.log('seatConfirm-step');
        return await step.prompt(CONFIRM_PROMPT, 'Do you want to select seat?', ['Yes', 'No']);
    }

    async seatSelectStep(step) {
        endDialog = false;
        console.log('seatSelect-step');
        if (step.result) {
            console.log('INSIDE seatSelect-step');
            const message = "_**Awesome**_, please select your seat for flight from **" + step.values.origin + "** to **"
                + step.values.destination + "** for **" + step.values.travellingClass + "** class ";
            await step.context.sendActivity({
                text: message,
                attachments: [this.getSeatArrangementAttachment()]
            });
            return await step.prompt(SEAT_SELECT_TEXT_PROMPT, '');
        } else {
            console.log(step.options);
            return await step.continueDialog();
        }
    }

    async paymentStep(step) {
        endDialog = false;
        console.log('payment-step');
        step.values.seat = step.result.toUpperCase()
        return await step.prompt(TEXT_PROMPT, 'Please complete payment by clicking [HERE](https://www.google.com/).');
    }

    async summaryStep(step) {
        endDialog = false;
        step.values.payment = step.result
        console.log('summary-step');
        // await step.context.sendActivities([
        //     { type: ActivityTypes.Typing },
        //     { type: 'delay', value: 5000 },
        //     { type: ActivityTypes.Message, text: '' }
        // ]);
        console.log('working');
        console.log(step.values);
        console.log(step.result);
        console.log(step);
        const bookingID = new Date().getTime();
        await step.context.sendActivities([
            { type: 'delay', value: 10000 },
            { type: 'message', text: '**Thank you for your payment!** Your tickets have been booked and your _booking ID_ is **FL' + bookingID + '**' },
            {
                type: 'message',
                attachments: [CardFactory.adaptiveCard(JSON.parse(
                    JSON.stringify(FlightBookingConfirmationCard)
                        .replace('${bookingID}', bookingID)
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
        console.log(value);
        if (promptContext.attemptCount > 1 && selectOptionsDateStep.indexOf(value) > -1) {
            return true;
        }
        value = Recognizers.recognizeDateTime(value, 'en-US');
        value = value[0].resolution.values[0].value;
        if (!moment(value).isValid() || moment(value).startOf('day').isBefore(moment(new Date()).startOf('day'))) {
            await promptContext.context.sendActivity('Please enter a valid date.');
            await promptContext.context.sendActivity(MessageFactory.suggestedActions(selectOptionsDateStep, ''));
            return false;
        }
        if (moment(value).startOf('day').isSame(moment(new Date()).startOf('day'))) {
            await promptContext.context.sendActivity('No Flights are available for today.');
            await promptContext.context.sendActivity(MessageFactory.suggestedActions(selectOptionsDateStep, ''));
            return false;
        }
        return true;
    }

    async seatBookingValidator(promptContext) {
        console.log(promptContext.recognized.value);
        if (!promptContext.recognized.succeeded) return false;
        const regexExp = /[a-c]{1}[1-6]{1}/ig;
        if (!regexExp.test(promptContext.recognized.value)) {
            await promptContext.context.sendActivity({
                text: 'Please select a seat from the image. (e.g **_A1_**)'
            });
            return false;
        }
        return true;
    }

    isJson(element) {
        try {
            JSON.parse(element);
            return true;
        } catch (error) {
            return false;
        }
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