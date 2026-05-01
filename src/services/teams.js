const { sendCardToTeams } = require('../bot');
const { requireEnv } = require('../utils/auth');

function buildApprovalCard({ ticketId, customer, customerEmail, reason, pcTag, mismatchWarning }) {
  const zammadUrl = requireEnv('ZAMMAD_URL').replace(/\/+$/, '');
  const openTicketUrl = `${zammadUrl}/#ticket/zoom/${ticketId}`;

  return {
    type: 'AdaptiveCard',
    version: '1.4',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'TextBlock',
        text: 'Admin Privilege Request',
        weight: 'Bolder',
        size: 'Medium'
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'User', value: customer || 'Unknown' },
          { title: 'Email', value: customerEmail || 'Not provided' },
          { title: 'Reason', value: reason || 'No reason provided' },
          { title: 'PC Tag', value: pcTag || 'Not found' }
        ]
      },
      ...(mismatchWarning
        ? [
            {
              type: 'TextBlock',
              text: mismatchWarning,
              wrap: true,
              color: 'Attention',
              spacing: 'Medium'
            }
          ]
        : [])
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Approve',
        data: {
          action: 'approve',
          ticket_id: String(ticketId),
          pc_tag: pcTag
        }
      },
      {
        type: 'Action.OpenUrl',
        title: 'Open Ticket',
        url: openTicketUrl
      }
    ]
  };
}

async function sendApprovalCard(payload) {
  const card = buildApprovalCard(payload);
  await sendCardToTeams(card);
}

module.exports = {
  sendApprovalCard,
  buildApprovalCard
};
