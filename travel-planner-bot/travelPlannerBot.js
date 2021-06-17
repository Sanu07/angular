// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory } = require('botbuilder');

const { RoomBookingDialog } = require('./componentDialogs/roomBookingDialog');
const { FlightBookingDialog } = require('./componentDialogs/flightBookingDialog');

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

        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            await this.dispatchToIntentAsync(context);
            await next();
        });

        this.onDialog(async (context, next) => {
            // Save any state changes. The load happened during the execution of the Dialog.
            await this.conversationState.saveChanges(context, false);
            await this.userState.saveChanges(context, false);
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            await this.sendWelcomeMessage(context)
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }

    async sendWelcomeMessage(context) {
        const { activity } = context;

        // Iterate over all new members added to the conversation.
        for (const idx in activity.membersAdded) {
            if (activity.membersAdded[idx].id !== activity.recipient.id) {
                const welcomeMessage = `Welcome to Restaurant Reservation Bot ${activity.membersAdded[idx].name}. `;
                await context.sendActivity(welcomeMessage);
                await this.sendSuggestedActions(context);
            }
        }
    }

    async sendSuggestedActions(context) {
        var reply = MessageFactory.suggestedActions(['Room Booking', 'Flight Booking'], 'What would you like to do today ?');
        await context.sendActivity(reply);
    }

    async dispatchToIntentAsync(context) {

        var currentIntent = '';
        const previousIntent = await this.previousIntent.get(context, {});
        const conversationData = await this.conversationData.get(context, {});

        if (previousIntent.intentName && conversationData.endDialog === false) {
            currentIntent = previousIntent.intentName;
        }
        else if (previousIntent.intentName && conversationData.endDialog === true) {
            currentIntent = context.activity.text;
        }
        else {
            currentIntent = context.activity.text;
            await this.previousIntent.set(context, { intentName: context.activity.text });
        }
        switch (currentIntent) {
            case 'Room Booking':
                console.log("Inside Room Booking");
                await this.conversationData.set(context, { endDialog: false });
                await this.roomBookingDialog.run(context, this.dialogState);
                conversationData.endDialog = await this.roomBookingDialog.isDialogComplete();
                if (conversationData.endDialog) {
                    await this.previousIntent.set(context, { intentName: null });
                    await this.sendSuggestedActions(context);
                }
                break;
            case 'Flight Booking':
                console.log("Inside Flight Booking");
                await this.conversationData.set(context, { endDialog: false });
                await this.flightBookingDialog.run(context, this.dialogState);
                conversationData.endDialog = await this.flightBookingDialog.isDialogComplete();
                if (conversationData.endDialog) {
                    await this.previousIntent.set(context, { intentName: null });
                    await this.sendSuggestedActions(context);
                }
                break;
            default:
                console.log("Did not match any case");
                break;
        }
    }
}

module.exports.TravelPlannerBot = TravelPlannerBot;
