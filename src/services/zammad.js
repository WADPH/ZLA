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

async function findUserByEmail(email) {
  const client = getClient();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  try {
    const response = await client.get('/api/v1/users/search', {
      params: { query: normalizedEmail }
    });
    const users = Array.isArray(response.data) ? response.data : [];
    const match = users.find((user) => (user?.email || '').toLowerCase() === normalizedEmail);
    if (match) {
      return match;
    }
  } catch (_error) {
    // Continue with fallback endpoint.
  }

  try {
    const response = await client.get('/api/v1/users', {
      params: { query: normalizedEmail }
    });
    const users = Array.isArray(response.data) ? response.data : [];
    return users.find((user) => (user?.email || '').toLowerCase() === normalizedEmail) || null;
  } catch (_error) {
    return null;
  }
}

async function assignTicketOwner(ticketId, ownerId) {
  const client = getClient();
  await client.put(`/api/v1/tickets/${ticketId}`, {
    owner_id: Number(ownerId)
  });
}

async function listGroups() {
  const client = getClient();
  const response = await client.get('/api/v1/groups');
  return Array.isArray(response.data) ? response.data : [];
}

async function findGroupByName(groupName) {
  const normalizedTarget = String(groupName || '').trim().toLowerCase();
  if (!normalizedTarget) {
    return null;
  }

  const groups = await listGroups();
  return groups.find((group) => String(group?.name || '').trim().toLowerCase() === normalizedTarget) || null;
}

async function assignTicketGroup(ticketId, groupId) {
  const client = getClient();
  await client.put(`/api/v1/tickets/${ticketId}`, {
    group_id: Number(groupId)
  });
}

async function assignTicketGroupByName(ticketId, groupName) {
  const client = getClient();
  await client.put(`/api/v1/tickets/${ticketId}`, {
    group: groupName
  });
}

module.exports = {
  createTicketArticle,
  closeTicket,
  getTicketById,
  getUserById,
  findUserByEmail,
  assignTicketOwner,
  findGroupByName,
  assignTicketGroup,
  assignTicketGroupByName
};
