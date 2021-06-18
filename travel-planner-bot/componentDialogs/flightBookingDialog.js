const { WaterfallDialog, ComponentDialog } = require('botbuilder-dialogs');
const { MessageFactory, CardFactory, AttachmentLayoutTypes } = require('botbuilder');

const { ConfirmPrompt, ChoicePrompt, DateTimePrompt, NumberPrompt, TextPrompt } = require('botbuilder-dialogs');

const { DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');

const SelectCityCard = require('../resources/adaptiveCards/SelectCityCard');
const SelectDateCard = require('../resources/adaptiveCards/SelectDateCard');
const RoomBookingConfirmationCard = require('../resources/adaptiveCards/RoomBookingConfirmationCard');

const TEXT_PROMPT = 'TEXT_PROMPT';
const DATETIME_PROMPT = 'DATETIME_PROMPT';
const FLIGHT_BOOKING_DIALOG = 'FLIGHT_BOOKING_DIALOG';
const CONFIRM_PROMPT = 'CONFIRM_PROMPT';
var endDialog = '';

class FlightBookingDialog extends ComponentDialog {
    constructor(conservsationState, userState) {

        super('flightBookingDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT));
        this.addDialog(new TextPrompt('destination_prompt', this.destinationValidator));
        this.addDialog(new DateTimePrompt(DATETIME_PROMPT));
        this.addDialog(new ConfirmPrompt(CONFIRM_PROMPT));

        this.addDialog(new WaterfallDialog(FLIGHT_BOOKING_DIALOG, [
            this.originStep.bind(this),
            this.destinationStep.bind(this),
            this.dateStep.bind(this),
            this.travellingClassStep.bind(this),
            this.seatBookingConfirmStep.bind(this),
            this.seatSelectStep.bind(this),
            this.paymentStep.bind(this),
            this.summaryStep.bind(this)
        ]));

        this.initialDialogId = FLIGHT_BOOKING_DIALOG;
    }

    async run(turnContext, accessor) {
        const dialogSet = new DialogSet(accessor);
        dialogSet.add(this);

        const dialogContext = await dialogSet.createContext(turnContext);
        const results = await dialogContext.continueDialog();
        if (results.status === DialogTurnStatus.empty) {
            await dialogContext.beginDialog(this.id);
        }
    }

    async originStep(step) {
        endDialog = false;
        if (step.options.customIndex && step.options.customIndex !== step.index) {
            return await step.next();
        }
        console.log('origin-step');
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(SelectCityCard)]
        });
        return await step.prompt(TEXT_PROMPT, '');
    }

    async destinationStep(step) {
        endDialog = false;
        console.log('destination-step');
        step.values.origin = step.result
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(SelectCityCard)]
        });
        const promptOptions = { prompt: '', retryPrompt: 'Please enter a valid dstination value' };
        return await step.prompt('destination_prompt', promptOptions);
    }

    async dateStep(step) {
        endDialog = false;
        console.log('date-step');
        step.values.destination = step.result
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(SelectDateCard)]
        });
        const promptOptions = { prompt: 'Provid a Date', retryPrompt: 'Please enter a valid date' };
        return await step.prompt(DATETIME_PROMPT, promptOptions);
    }

    async travellingClassStep(step) {
        step.values.date = step.result
        console.log('travelling-step');
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(SelectDateCard)]
        });
        return { status: DialogTurnStatus.waiting };
    }

    async seatBookingConfirmStep(step) {
        endDialog = false;
        step.values.class = step.result
        console.log('seatConfirm-step');
        return await step.prompt(CONFIRM_PROMPT, 'Are you sure that all values are correct and you want to make the reservation?', ['yes', 'no']);
    }

    async seatSelectStep(step) {
        endDialog = false;
        console.log('seatSelect-step');
        if (step.result === true) {
            console.log('INSIDE seatSelect-step');
            await step.context.sendActivity({
                attachments: [CardFactory.adaptiveCard(SelectDateCard)]
            });
        } else {
            console.log(step.options);
            return await step.replaceDialog(FLIGHT_BOOKING_DIALOG, { customIndex: 1 });
            // return await step.next(-1);
        }
        return await step.prompt(TEXT_PROMPT, '');
    }

    async paymentStep(step) {
        endDialog = false;
        console.log('payment-step');
        step.values.seat = step.result
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(SelectCityCard)]
        });
        return await step.prompt(TEXT_PROMPT, '');
    }

    async summaryStep(step) {
        step.values.payment = step.result
        console.log('summary-step');
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(RoomBookingConfirmationCard)]
        });
        console.log(step.values);
        console.log(step.result);
        console.log(step);
        return await step.endDialog();
    }

    async isDialogComplete() {
        return endDialog;
    }

    async destinationValidator(promptContext) {
        console.log(promptContext.recognized.value)
        // This condition is our validation rule. You can also change the value at this point.
        return promptContext.recognized.succeeded && promptContext.recognized.value.length > 5;
    }
}

module.exports.FlightBookingDialog = FlightBookingDialog;