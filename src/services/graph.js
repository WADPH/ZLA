const axios = require('axios');
const { requireEnv } = require('../utils/auth');

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

async function getGraphAccessToken() {
  const tenantId = requireEnv('TENANT_ID');
  const clientId = requireEnv('MICROSOFT_APP_ID');
  const clientSecret = requireEnv('MICROSOFT_APP_PASSWORD');

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  });

  const response = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return response.data.access_token;
}

async function findManagedDeviceByTag(accessToken, pcTag) {
  const url = `${GRAPH_BASE_URL}/deviceManagement/managedDevices`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      '$filter': `deviceName eq '${pcTag}'`
    }
  });

  return response.data.value?.[0] || null;
}

async function getLapsPassword(accessToken, managedDeviceId) {
  const url = `${GRAPH_BASE_URL}/deviceManagement/managedDevices/${managedDeviceId}/getLapsPassword`;

  const response = await axios.post(
    url,
    {},
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  return response.data;
}

module.exports = {
  getGraphAccessToken,
  findManagedDeviceByTag,
  getLapsPassword
};
