const { ComponentDialog, DialogTurnStatus } = require('botbuilder-dialogs');

/**
 * This class handles the cancel text at any of the waterfall step. The onContinueDialog method from Component
 * Dialog has been overridden to verify if the text input at any point is 'cancel' or not.
 */
class CancelBookingDialog extends ComponentDialog {

    async onContinueDialog(innerDc) {
        const result = await this.interrupt(innerDc);
        if (result) {
            return { status: DialogTurnStatus.cancelled };
        }
        return await super.onContinueDialog(innerDc);
    }

    async interrupt(innerDc) {
        if (innerDc.context.activity.text) {
            const text = innerDc.context.activity.text.toLowerCase();
            if (text === 'cancel') {
                await innerDc.context.sendActivity('**BOOKING PROCESS CANCELLED**');
                return await innerDc.cancelAllDialogs();
            }
        }
    }
}

module.exports.CancelBookingDialog = CancelBookingDialog;