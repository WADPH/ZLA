const axios = require('axios');
const { requireEnv } = require('../utils/auth');

function getClient() {
  const baseURL = requireEnv('ZAMMAD_URL');
  const token = requireEnv('ZAMMAD_TOKEN');

  return axios.create({
    baseURL,
    headers: {
      Authorization: `Token token=${token}`,
      'Content-Type': 'application/json'
    }
  });
}

async function createTicketArticle(ticketId, body, internal = false) {
  const client = getClient();

  await client.post('/api/v1/ticket_articles', {
    ticket_id: Number(ticketId),
    body,
    type: 'phone',
    internal,
    subject: 'ZLA LAPS Result'
  });
}

async function closeTicket(ticketId) {
  const client = getClient();

  await client.put(`/api/v1/tickets/${ticketId}`, {
    state: 'closed'
  });
}

async function getTicketById(ticketId, expand = true) {
  const client = getClient();
  const response = await client.get(`/api/v1/tickets/${ticketId}`, {
    params: { expand }
  });
  return response.data;
}

async function getUserById(userId) {
  const client = getClient();
  const response = await client.get(`/api/v1/users/${userId}`);
  return response.data;
}

module.exports = {
  createTicketArticle,
  closeTicket,
  getTicketById,
  getUserById
};
