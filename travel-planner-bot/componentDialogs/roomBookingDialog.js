const { WaterfallDialog, ComponentDialog } = require('botbuilder-dialogs');
const { MessageFactory, CardFactory, AttachmentLayoutTypes } = require('botbuilder');

const { ConfirmPrompt, ChoicePrompt, DateTimePrompt, NumberPrompt, TextPrompt } = require('botbuilder-dialogs');

const { DialogSet, DialogTurnStatus } = require('botbuilder-dialogs');

const SelectCityCard = require('../resources/adaptiveCards/SelectCityCard');
const SelectDateCard = require('../resources/adaptiveCards/SelectDateCard');
const RoomBookingConfirmationCard = require('../resources/adaptiveCards/RoomBookingConfirmationCard');
const lodash = require('lodash');
const moment = require('moment');
const Recognizers = require('@microsoft/recognizers-text-date-time');

const TEXT_PROMPT = 'TEXT_PROMPT';
const CONFIRM_PROMPT = 'CONFIRM_PROMPT';
const HOTEL_LIST_TEXT_PROMPT = 'HOTEL_LIST_TEXT_PROMPT';
const ROOM_BOOKING_DIALOG = 'ROOM_BOOKING_DIALOG';
const hotelList = [
    { name: 'Hotel ABC', price: '1,400', ratings: '4 ★★★★☆', reviews: '(1746 reviews)', imageURL: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/14/e5/53/d3/sonesta-inns-resort.jpg?w=900&h=-1&s=1' },
    { name: 'Hotel DEF', price: '1,800', ratings: '4 ★★★★☆', reviews: '(2016 reviews)', imageURL: 'https://media.istockphoto.com/photos/interior-of-a-modern-luxury-hotel-double-bed-bedroom-picture-id1163498940?k=6&m=1163498940&s=612x612&w=0&h=NEsid6vx4Lfy-6hrZoPJacuvgk_krlxS8yI9VD5Wl7M=' },
    { name: 'Hotel GHI', price: '1,500', ratings: '3 ★★★☆☆', reviews: '(1886 reviews)', imageURL: 'https://skift.com/wp-content/uploads/2021/05/JS_190520_0010-1024x684.jpg' },
    { name: 'Hotel JKL', price: '1,700', ratings: '4 ★★★★☆', reviews: '(1711 reviews)', imageURL: 'https://thumbs.dreamstime.com/b/hotel-lobby-luxury-staircases-fountain-39479289.jpg' }
]
var endDialog = false;
var isChildDialogCompleted = false;

class RoomBookingDialog extends ComponentDialog {
    constructor(conversationState, userState) {

        super('roomBookingDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT));
        this.addDialog(new TextPrompt(HOTEL_LIST_TEXT_PROMPT, this.hotelNameValidator));
        this.addDialog(new ConfirmPrompt(CONFIRM_PROMPT));

        this.addDialog(new WaterfallDialog(ROOM_BOOKING_DIALOG, [
            this.confirmDestinationStep.bind(this),
            this.selectDestinationStep.bind(this),
            this.selectDateStep.bind(this),
            this.selectHotelStep.bind(this),
            this.summaryStep.bind(this)
        ]));

        this.initialDialogId = ROOM_BOOKING_DIALOG;
        this.conversationState = conversationState;
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

    async confirmDestinationStep(step) {
        endDialog = false;
        this.conversationData = await this.conversationState.get(step.context, {});
        if (this.conversationData.flightBookingData) {
            this.timeDiff = moment.duration(moment(new Date()).diff(this.conversationData.flightBookingData.accessTime)).asSeconds();
        }
        if (step.options.customIndex && step.options.customIndex !== step.index) {
            return await step.continueDialog();
        }
        if (this.timeDiff <= 20 && this.conversationData.flightBookingData && this.conversationData.flightBookingData.destination) {
            this.skipDestinationStep = true;
            return await step.prompt(CONFIRM_PROMPT, 'Do you want to book room for ' + this.conversationData.flightBookingData.destination + '?', ['Yes', 'No']);
        }
        return await step.continueDialog();
    }

    async selectDestinationStep(step) {
        endDialog = false;
        console.log('book room - destination');
        if (step.result && this.skipDestinationStep) {
            step.values.destination = this.conversationData.flightBookingData.destination;
            this.skipDestinationStep = false;
            this.skipDateStep = true;
            return await step.continueDialog();
        }
        if (step.options.customIndex && step.options.customIndex !== step.index) {
            step.values.destination = step.options.destination;
            return await step.continueDialog();
        }
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectCityCard).replace('${title}', 'Please provide destination for Room booking')))]
        });
        return await step.prompt(TEXT_PROMPT, '');
    }

    async selectDateStep(step) {
        endDialog = false;
        if (step.options.customIndex && step.options.customIndex !== step.index) {
            step.values.bookingDate = step.options.bookingDate;
            this.skipDateStep = true;
            return await step.continueDialog();
        }
        if (this.skipDateStep) {
            step.values.bookingDate = this.conversationData.flightBookingData.bookingDate;
            return await step.continueDialog();
        }
        step.values.destination = step.result
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectDateCard)
                    .replace('${title}', 'For when you want to book Room?')
                    .replace('${today}', moment(new Date()).format("DD/MM/YYYY"))
                    .replace('${tomorrow}', moment().add(1, 'days').format("DD/MM/YYYY"))
            ))]
        });
        return await step.prompt(TEXT_PROMPT, '');
    }

    async selectHotelStep(step) {
        endDialog = false;
        var value = step.result;
        if (this.skipDateStep) {
            this.skipDateStep = false;
        } else {
            value = Recognizers.recognizeDateTime(value, 'en-US');
            step.values.bookingDate = moment(value[0].resolution.values[0].value, 'YYYY-MM-DD').startOf('day').format('DD-MMMM-YYYY');
        }
        await step.context.sendActivity({
            attachments: this.productChoices(),
            attachmentLayout: AttachmentLayoutTypes.Carousel
        });
        return await step.prompt(HOTEL_LIST_TEXT_PROMPT, '');
    }

    async summaryStep(step) {
        const hotel = lodash.find(hotelList, (h) => {
            return h.name.toLowerCase() === step.result.toLowerCase();
        });
        step.values.hotel = hotel;
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(RoomBookingConfirmationCard)
                    .replace(/\${name}/g, step.values.hotel.name)
                    .replace('${ratings}', step.values.hotel.ratings)
                    .replace('${reviews}', step.values.hotel.reviews)
                    .replace('${imageURL}', step.values.hotel.imageURL)
                    .replace('${destination}', step.values.destination)
                    .replace('${date}', step.values.bookingDate)
            ))]
        });
        console.log(step.values);
        console.log(step.result);
        console.log(step);
        endDialog = true;
        if (step.parent && step.parent.parent && step.parent.parent.activeDialog.id === 'flightBookingDialog') {
            isChildDialogCompleted = true;
        }
        return await step.endDialog();
    }

    async isDialogComplete() {
        return endDialog;
    }

    async isChildDialogCompleted() {
        return isChildDialogCompleted;
    }

    async resetChildDialog() {
        isChildDialogCompleted = false;
        return isChildDialogCompleted;
    }

    async hotelNameValidator(promptContext) {
        console.log(promptContext.recognized.value);
        if (!promptContext.recognized.succeeded) return false;
        const hotel = lodash.find(hotelList, (h) => {
            return h.name.toLowerCase() === promptContext.recognized.value.toLowerCase();
        });
        if (!hotel) {
            await promptContext.context.sendActivity('Please enter a valid hotel name.(e.g **_Hotel ABC_**)');
            return false;
        }
        return true;
    }

    productChoices() {
        const productSeriesOptions = [
            CardFactory.heroCard(
                hotelList[0].name + ' \n\n INR ' + hotelList[0].price + '  per room/night \n\n' + hotelList[0].ratings + ' ' + hotelList[0].reviews,
                [hotelList[0].imageURL],
            ),

            CardFactory.heroCard(
                hotelList[1].name + ' \n\n INR ' + hotelList[1].price + '  per room/night \n\n' + hotelList[1].ratings + ' ' + hotelList[1].reviews,
                [hotelList[1].imageURL],
            ),

            CardFactory.heroCard(
                hotelList[2].name + ' \n\n INR ' + hotelList[2].price + '  per room/night \n\n' + hotelList[2].ratings + ' ' + hotelList[2].reviews,
                [hotelList[2].imageURL],
            ),

            CardFactory.heroCard(
                hotelList[3].name + ' \n\n INR ' + hotelList[3].price + '  per room/night \n\n' + hotelList[3].ratings + ' ' + hotelList[3].reviews,
                [hotelList[3].imageURL],
            )
        ];

        return productSeriesOptions;
    }

}

module.exports.RoomBookingDialog = RoomBookingDialog;