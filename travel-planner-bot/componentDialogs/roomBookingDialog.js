const { WaterfallDialog, ComponentDialog } = require('botbuilder-dialogs');
const { MessageFactory, CardFactory, AttachmentLayoutTypes } = require('botbuilder');

const { ConfirmPrompt, ChoicePrompt, DateTimePrompt, NumberPrompt, TextPrompt } = require('botbuilder-dialogs');

const { DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');

const SelectCityCard = require('../resources/adaptiveCards/SelectCityCard');
const SelectDateCard = require('../resources/adaptiveCards/SelectDateCard');
const RoomBookingConfirmationCard = require('../resources/adaptiveCards/RoomBookingConfirmationCard');

const TEXT_PROMPT = 'TEXT_PROMPT';
const DATETIME_PROMPT = 'DATETIME_PROMPT';
const ROOM_BOOKING_DIALOG = 'ROOM_BOOKING_DIALOG';
var endDialog = '';

class RoomBookingDialog extends ComponentDialog {
    constructor(conservsationState, userState) {

        super('roomBookingDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT));
        this.addDialog(new DateTimePrompt(DATETIME_PROMPT));

        this.addDialog(new WaterfallDialog(ROOM_BOOKING_DIALOG, [
            this.getDestination.bind(this),
            this.getDate.bind(this),
            this.getHotelsList.bind(this),
            this.summaryStep.bind(this)
        ]));

        this.initialDialogId = ROOM_BOOKING_DIALOG;
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

    async getDestination(step) {
        endDialog = false;
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(SelectCityCard)]
        });
        // Running a prompt here means the next WaterfallStep will be run when the users response is received.
        return await step.prompt(TEXT_PROMPT, '');
    }

    async getDate(step) {
        endDialog = false;
        step.values.destination = step.result
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(SelectDateCard)]
        });
        return await step.prompt(TEXT_PROMPT, '');
    }

    async getHotelsList(step) {
        step.values.date = step.result
        await step.context.sendActivity({
            attachments: this.productChoices(),
            attachmentLayout: AttachmentLayoutTypes.Carousel
        });
        return { status: DialogTurnStatus.waiting };
    }

    async summaryStep(step) {
        step.values.hotel = step.result
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

    productChoices() {
        const productSeriesOptions = [
            CardFactory.heroCard(
                'Hotel ABC \n\n INR 1,400 per room/night \n\n 4 ★★★★☆ (1746 reviews)',
                ['https://dynamic-media-cdn.tripadvisor.com/media/photo-o/14/e5/53/d3/sonesta-inns-resort.jpg?w=900&h=-1&s=1'],
            ),

            CardFactory.heroCard(
                'Hotel PQR \n\n INR 1,500 per room/night \n\n 3 ★★★☆☆ (1436 reviews)',
                ['https://media.istockphoto.com/photos/interior-of-a-modern-luxury-hotel-double-bed-bedroom-picture-id1163498940?k=6&m=1163498940&s=612x612&w=0&h=NEsid6vx4Lfy-6hrZoPJacuvgk_krlxS8yI9VD5Wl7M='],
            ),

            CardFactory.heroCard(
                'Hotel MNO \n\n INR 1,300 per room/night \n\n 4 ★★★★☆ (1777 reviews)',
                ['https://thumbs.dreamstime.com/b/hotel-lobby-luxury-staircases-fountain-39479289.jpg'],
            ),

            CardFactory.heroCard(
                'Hotel XYZ \n\n INR 1,600 per room/night \n\n 3 ★★★☆☆ (1892 reviews)',
                ['https://skift.com/wp-content/uploads/2021/05/JS_190520_0010-1024x684.jpg'],
            )
        ];

        return productSeriesOptions;
    }

}

module.exports.RoomBookingDialog = RoomBookingDialog;