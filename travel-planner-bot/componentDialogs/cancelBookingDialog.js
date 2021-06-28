const { InputHints } = require('botbuilder');
const { ComponentDialog, DialogTurnStatus } = require('botbuilder-dialogs');

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
                await innerDc.context.sendActivity('**CANCELLED**');
                return await innerDc.cancelAllDialogs();
            }
        }
    }
}

module.exports.CancelBookingDialog = CancelBookingDialog;