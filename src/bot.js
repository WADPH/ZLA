const { BotFrameworkAdapter, ActivityHandler, CardFactory } = require('botbuilder');
const { handleApproveAction } = require('./routes/approve');
const { requireEnv } = require('./utils/auth');

const adapter = new BotFrameworkAdapter({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD,
  channelAuthTenant: process.env.TENANT_ID
});

adapter.onTurnError = async (context, error) => {
  console.error('[BOT] Turn error:', error.message);
  await context.sendActivity('An error occurred while processing your request.');
};

class ZlaBot extends ActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const conversationMeta = {
        serviceUrl: context.activity.serviceUrl,
        conversationId: context.activity.conversation?.id
      };

      // Log identifiers needed for .env configuration.
      console.log('[BOT] Incoming message metadata:');
      console.log(JSON.stringify(conversationMeta, null, 2));

      const payload = context.activity.value;

      if (!payload || payload.action !== 'approve') {
        await context.sendActivity('Message received.');
        await next();
        return;
      }

      console.log(`[BOT] Approve received for ticket=${payload.ticket_id}, pc_tag=${payload.pc_tag}`);
      await context.sendActivity('Approval received. Processing request...');

      const result = await handleApproveAction({
        ticketId: payload.ticket_id,
        pcTag: payload.pc_tag,
        approvedBy: context.activity.from?.name || 'Unknown Approver'
      });
      const approvedBy = context.activity.from?.name || 'Unknown Approver';

      if (result.success) {
        await context.sendActivity(`Request processed successfully by ${approvedBy}. Ticket was updated and closed.`);
      } else {
        await context.sendActivity(`Processing failed: ${result.error}`);
      }

      await next();
    });
  }
}

function getConversationReference() {
  const serviceUrl = requireEnv('TEAMS_SERVICE_URL');
  const rawConversationId = requireEnv('TEAMS_CONVERSATION_ID');
  const appId = requireEnv('MICROSOFT_APP_ID');
  const conversationId = rawConversationId.split(';messageid=')[0];

  return {
    serviceUrl,
    conversation: { id: conversationId },
    bot: { id: appId },
    channelId: 'msteams'
  };
}

async function sendCardToTeams(cardContent) {
  const reference = getConversationReference();

  console.log('[TEAMS] Sending adaptive card to Teams conversation');

  await adapter.continueConversation(reference, async (turnContext) => {
    await turnContext.sendActivity({
      attachments: [CardFactory.adaptiveCard(cardContent)]
    });
  });

  console.log('[TEAMS] Adaptive card sent successfully');
}

module.exports = {
  adapter,
  bot: new ZlaBot(),
  sendCardToTeams
};
