// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory } = require('botbuilder');
const { ActionTypes } = require('botframework-schema');

const { RoomBookingDialog } = require('./componentDialogs/roomBookingDialog');
const { FlightBookingDialog } = require('./componentDialogs/flightBookingDialog');
const WelcomeCard = require('./resources/adaptiveCards/WelcomeCard');
const { CardFactory } = require('botbuilder');
const { LuisRecognizer } = require('botbuilder-ai');

const FLIGHT_BOOKING = "Book a flight";
const ROOM_BOOKING = "Book a room";
const WELCOME_MESSAGE = "Hi, I am your travel planner, you can ask me to book your flight and hotel rooms 😊"

class TravelPlannerBot extends ActivityHandler {
    constructor(conversationState, userState) {
        super();

        this.conversationState = conversationState;
        this.userState = userState;
        this.dialogState = conversationState.createProperty("dialogState");
        this.roomBookingDialog = new RoomBookingDialog(this.conversationState, this.userState);
        this.flightBookingDialog = new FlightBookingDialog(this.conversationState, this.userState);

        this.previousIntent = this.conversationState.createProperty("previousIntent");
        this.conversationData = this.conversationState.createProperty('conversationData');

        const dispatchRecognizer = new LuisRecognizer({
            applicationId: process.env.LuisAppId,
            endpointKey: process.env.LuisAPIKey,
            endpoint: `https://${process.env.LuisAPIHostName}.api.cognitive.microsoft.com`
        }, {
            includeAllIntents: true,
            apiVersion: 'v3'
        }, true);

        this.onMessage(async (context, next) => {
            const luisResult = await dispatchRecognizer.recognize(context);
            const intent = LuisRecognizer.topIntent(luisResult);
            const entities = luisResult.entities;
            await this.dispatchToIntentAsync(context, intent, entities);
            await next();
        });

        this.onDialog(async (context, next) => {
            await this.conversationState.saveChanges(context, false);
            await this.userState.saveChanges(context, false);
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            await this.sendWelcomeMessage(context)
            await next();
        });
    }

    async sendWelcomeMessage(context) {
        const { activity } = context;

        for (const idx in activity.membersAdded) {
            if (activity.membersAdded[idx].id !== activity.recipient.id) {
                const welcomeMessage = WELCOME_MESSAGE;
                await this.sendSuggestedActions(context);
            }
        }
    }

    async sendSuggestedActions(context, delay) {
        delay = delay || 0;
        await new Promise(resolve => setTimeout(resolve, delay));
        await context.sendActivity({
            attachments: [CardFactory.adaptiveCard(WelcomeCard)]
        });
    }

    async dispatchToIntentAsync(context, intent, entities) {

        var currentIntent = '';
        const previousIntent = await this.previousIntent.get(context, {});
        const conversationData = await this.conversationData.get(context, {});
        if (context.activity.text === undefined && context.activity.value) {
            context.activity.text = JSON.stringify(context.activity.value);
        }
        if (previousIntent.intentName && conversationData.endDialog === false) {
            currentIntent = previousIntent.intentName;
        }
        else if (previousIntent.intentName && conversationData.endDialog === true) {
            currentIntent = intent;
        }
        else {
            currentIntent = intent;
            await this.previousIntent.set(context, { intentName: intent });
        }
        switch (currentIntent) {
            case 'Book_a_room':
                await this.conversationData.set(context, { endDialog: false });
                await this.roomBookingDialog.run(context, this.dialogState);
                conversationData.endDialog = await this.roomBookingDialog.isDialogComplete();
                if (conversationData.endDialog) {
                    await this.previousIntent.set(context, { intentName: undefined });
                    await this.conversationState.clear(context);
                    // this delay is added to keep a small gap between the completion of a particular dialog
                    // and displaying the welcome message
                    await this.sendSuggestedActions(context, 2000);
                }
                break;
            case 'Book_a_flight':
                await this.conversationData.set(context, { endDialog: false });
                await this.flightBookingDialog.run(context, this.dialogState, entities);
                conversationData.endDialog = await this.flightBookingDialog.isDialogComplete();
                conversationData.endChildDialog = await this.roomBookingDialog.isChildDialogCompleted();
                if (conversationData.endDialog || conversationData.endChildDialog) {
                    await this.previousIntent.set(context, { intentName: undefined });
                    await this.roomBookingDialog.resetChildDialog();
                    // this only clears the data if child dialog is completed otherwise it has to be referred
                    // if user tries to book a room within 20 sec after completing flight booking
                    if (conversationData.endChildDialog) {
                        await this.conversationState.clear(context);
                    }
                    // this delay is added to keep a small gap between the completion of a particular dialog
                    // and displaying the welcome message
                    await this.sendSuggestedActions(context, 5000);
                }
                break;
            default:
                const didntUnderstandMessageText = `**_Sorry_**, I didn't get that. Please try something as suggested.`;
                await context.sendActivity(didntUnderstandMessageText, didntUnderstandMessageText);
                break;
        }
    }
}

module.exports.TravelPlannerBot = TravelPlannerBot;
