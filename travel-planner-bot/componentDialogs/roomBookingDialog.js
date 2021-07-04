const common = require('../utils/util');
const { CardFactory, AttachmentLayoutTypes } = require('botbuilder');
const { DialogSet, DialogTurnStatus, WaterfallDialog, ConfirmPrompt, TextPrompt } = require('botbuilder-dialogs');

const SelectCityCard = require('../resources/adaptiveCards/SelectCityCard');
const SelectDateCard = require('../resources/adaptiveCards/SelectDateCard');
const RoomBookingConfirmationCard = require('../resources/adaptiveCards/RoomBookingConfirmationCard');
const lodash = require('lodash');
const moment = require('moment');
const { CancelBookingDialog } = require('./cancelBookingDialog');

const TEXT_PROMPT = 'TEXT_PROMPT';
const DATE_TEXT_PROMPT = 'DATE_TEXT_PROMPT';
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

class RoomBookingDialog extends CancelBookingDialog {
    constructor(conversationState, userState) {

        super('roomBookingDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT));
        this.addDialog(new TextPrompt(DATE_TEXT_PROMPT, this.roomBookingDateValidator));
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
        } else if (results.status === DialogTurnStatus.complete) {
            endDialog = true;
        }
    }

    /**
     * This part of code block checks whether the user tries to book a room within 20 seconds after completing
     * the flight booking process and based on that, we prompt/skip the below logic
     */
    async confirmDestinationStep(step) {
        // the endDialog variable keeps a track of whether the dialog is completed or not.
        endDialog = false;
        // the conversationData is required to get details related to the flightBooking like Destination,origin etc
        this.conversationData = await this.conversationState.get(step.context, {});
        if (this.conversationData.flightBookingData) {
            this.timeDiff = moment.duration(moment(new Date()).diff(this.conversationData.flightBookingData.accessTime)).asSeconds();
        }
        // the custom index value checks whether the roomBookingDialog is called to execute from a specific step
        // if step.options.customIndex matches the step.index, then this is the starting step of this Dialog otherwise 
        // continue to check the next step.
        if (step.options.customIndex && step.options.customIndex !== step.index) {
            return await step.continueDialog();
        }
        // If the time difference is less than 20 seconds, prompt the user whether user wants to book a room for the specified 
        // destination for flight booking
        if (this.timeDiff <= 20 && this.conversationData.flightBookingData && this.conversationData.flightBookingData.destination) {
            this.skipDestinationStep = true;
            return await step.prompt(CONFIRM_PROMPT, 'Do you want to book room for ' + this.conversationData.flightBookingData.destination + '?', ['Yes', 'No']);
        }
        return await step.continueDialog();
    }

    async selectDestinationStep(step) {
        endDialog = false;
        // this code block executes when user chooses yes for "Do you want to book room for <city name>"
        if (step.result && this.skipDestinationStep) {
            step.values.destination = this.conversationData.flightBookingData.destination;
            step.values.destination = step.values.destination.charAt(0).toUpperCase() + step.values.destination.slice(1).toLowerCase();
            this.skipDestinationStep = false;
            this.skipDateStep = true;
            return await step.continueDialog();
        }
        // this executes when user chooses Yes for "Do you want to book hotel room also?"
        if (step.options.customIndex && step.options.customIndex !== step.index) {
            step.values.destination = step.options.destination;
            step.values.destination = step.values.destination.charAt(0).toUpperCase() + step.values.destination.slice(1).toLowerCase();
            return await step.continueDialog();
        }
        // this executes for all other cases
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectCityCard).replace('${title}', 'Please provide destination for Room booking')))]
        });

        return await step.prompt(TEXT_PROMPT, '');
    }

    async selectDateStep(step) {
        endDialog = false;
        // this executes when user chooses Yes for "Do you want to book hotel room also?"
        if (step.options.customIndex && step.options.customIndex !== step.index) {
            step.values.bookingDate = step.options.bookingDate;
            this.skipDateStep = true;
            return await step.continueDialog();
        }
        // this code block executes when user chooses yes for "Do you want to book room for <city name>"
        if (this.skipDateStep) {
            step.values.bookingDate = this.conversationData.flightBookingData.bookingDate;
            return await step.continueDialog();
        }
        // this first verifies whether the destination input is coming form adaptive cards Text Input which is in json format 
        // or is it a simple text. BAsed on that, it parses the destination Input
        if (common.isJson(step.result)) {
            const destination = JSON.parse(step.result).place;
            step.values.destination = destination.charAt(0).toUpperCase() + destination.slice(1).toLowerCase();
        } else {
            step.values.destination = step.result.charAt(0).toUpperCase() + step.result.slice(1).toLowerCase();
        }
        await step.context.sendActivity({
            attachments: [CardFactory.adaptiveCard(JSON.parse(
                JSON.stringify(SelectDateCard)
                    .replace('${title}', 'For when you want to book Room?')
                    .replace('${today}', moment(new Date()).format("DD-MM-YYYY"))
                    .replace('${tomorrow}', moment().add(1, 'days').format("DD-MM-YYYY"))
            ))]
        });
        return await step.prompt(DATE_TEXT_PROMPT, '');
    }

    /**
     * Displays a list of hotel names, their price and reviews to choose from
     */
    async selectHotelStep(step) {
        endDialog = false;
        if (this.skipDateStep) {
            this.skipDateStep = false;
        } else {
            const value = common.isJson(step.result) ? moment(JSON.parse(step.result).date, 'YYYY-MM-DD') :
                moment(step.result, 'DD-MM-YYYY');
            step.values.bookingDate = moment(value).startOf('day').format('DD-MMMM-YYYY');
        }
        await step.context.sendActivity({
            text: 'Please select from below available hotels',
            attachments: this.getHotelChoices(),
            attachmentLayout: AttachmentLayoutTypes.Carousel
        });
        return await step.prompt(HOTEL_LIST_TEXT_PROMPT, '');
    }

    /**
     * This adaptive card has been customized to provide the details related to room booking. The dynamic parameters
     * mentioned as ${} are replaced with the values specified by the user
     */
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
        endDialog = true;
        // isChildDialogCompleted should be false when roomBookingDialog was called separately otherwise true
        // if it was called from the flightBookingDialog when user clicks yes with the prompt
        // "Do you want to book hotel room also?"
        if (step.parent && step.parent.parent && step.parent.parent.activeDialog.id === 'flightBookingDialog') {
            isChildDialogCompleted = true;
        }
        return await step.endDialog();
    }

    async isDialogComplete() {
        return endDialog;
    }

    /**
     * This method is called from the travelPlannerBot.js to check whether the childDialog (roomBookingDialog)
     * is completed or not.
     */
    async isChildDialogCompleted() {
        return isChildDialogCompleted;
    }

    /**
     * This method is called from travelPlannerBot.js to reset the isChildDialogCompleted
     */
    async resetChildDialog() {
        isChildDialogCompleted = false;
        return isChildDialogCompleted;
    }

    /**
     * This only validates whether user provided a valid date or not
     */
    async roomBookingDateValidator(promptContext) {
        if (!promptContext.recognized.succeeded) return false;
        const bookingDate = promptContext.recognized.value;
        if (moment(promptContext.recognized.value, 'DD-MM-YYYY').isValid()) {
            return true;
        } else {
            await promptContext.context.sendActivity('Please enter a valid date in format (DD-MM-YYYY). (e.g **' + moment(new Date()).format('DD-MM-YYYY') + '**) for **' + moment(new Date()).format('DD-MMMM-YYYY') + '**');
            return false;
        }
    }

    /**
     * This validates whether the name typed by the user matches any hotel name in the hoteList. It accepts
     * only if there is a match otherwise it reprompts to provide a valid hotel name as suggested
     */
    async hotelNameValidator(promptContext) {
        if (!promptContext.recognized.succeeded) return false;
        const hotel = lodash.find(hotelList, (h) => {
            return h.name.toLowerCase() === promptContext.recognized.value.toLowerCase();
        });
        if (!hotel) {
            await promptContext.context.sendActivity('Please enter a valid hotel name from the available hotels.(e.g **_Hotel ABC_**)');
            return false;
        }
        return true;
    }

    getHotelChoices() {
        const productSeriesOptions = [
            CardFactory.heroCard(
                hotelList[0].name + ' \n\n INR ' + hotelList[0].price + ' ~~2100~~  per room/night \n\n' + hotelList[0].ratings + ' ' + hotelList[0].reviews,
                [hotelList[0].imageURL],
            ),

            CardFactory.heroCard(
                hotelList[1].name + ' \n\n INR ' + hotelList[1].price + ' ~~2400~~  per room/night \n\n' + hotelList[1].ratings + ' ' + hotelList[1].reviews,
                [hotelList[1].imageURL],
            ),

            CardFactory.heroCard(
                hotelList[2].name + ' \n\n INR ' + hotelList[2].price + ' ~~2200~~  per room/night \n\n' + hotelList[2].ratings + ' ' + hotelList[2].reviews,
                [hotelList[2].imageURL],
            ),

            CardFactory.heroCard(
                hotelList[3].name + ' \n\n INR ' + hotelList[3].price + ' ~~2300~~  per room/night \n\n' + hotelList[3].ratings + ' ' + hotelList[3].reviews,
                [hotelList[3].imageURL],
            )
        ];

        return productSeriesOptions;
    }

}

module.exports.RoomBookingDialog = RoomBookingDialog;