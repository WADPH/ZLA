const { sendCardToTeams } = require('../bot');
const { requireEnv } = require('../utils/auth');

function buildApprovalCard({ ticketId, customer, customerEmail, body, larReason, pcTag, mismatchWarning }) {
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
          { title: 'Body', value: body || 'No body provided' },
          { title: 'Reason', value: larReason || 'Not provided' },
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

function buildMissingTagCard({ ticketId, customer, customerEmail, body, larReason }) {
  const zammadUrl = requireEnv('ZAMMAD_URL').replace(/\/+$/, '');
  const openTicketUrl = `${zammadUrl}/#ticket/zoom/${ticketId}`;

  return {
    type: 'AdaptiveCard',
    version: '1.4',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'TextBlock',
        text: 'Local Admin Rights (LAR) Request',
        weight: 'Bolder',
        size: 'Medium'
      },
      {
        type: 'TextBlock',
        text: 'PC tag was not found in this ticket.',
        wrap: true,
        color: 'Attention',
        spacing: 'Small'
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'User', value: customer || 'Unknown' },
          { title: 'Email', value: customerEmail || 'Not provided' },
          { title: 'Body', value: body || 'No body provided' },
          { title: 'Reason', value: larReason || 'Not provided' }
        ]
      }
    ],
    actions: [
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

async function sendMissingTagCard(payload) {
  const card = buildMissingTagCard(payload);
  await sendCardToTeams(card);
}

module.exports = {
  sendApprovalCard,
  sendMissingTagCard,
  buildApprovalCard,
  buildMissingTagCard
};
