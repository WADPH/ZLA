const { sendCardToTeams } = require('../bot');

function buildApprovalCard({ ticketId, customer, reason, pcTag }) {
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
          { title: 'Reason', value: reason || 'No reason provided' },
          { title: 'PC Tag', value: pcTag || 'Not found' }
        ]
      }
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
