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

async function getLapsPassword(accessToken, deviceLocalCredentialId, pcTag) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 1) Try direct lookup by ID first.
  try {
    const byIdUrl = `${GRAPH_BASE_URL}/directory/deviceLocalCredentials/${deviceLocalCredentialId}`;
    const byIdResponse = await axios.get(byIdUrl, {
      headers,
      params: { '$select': 'id,deviceName,credentials' }
    });
    return byIdResponse.data;
  } catch (error) {
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    // Some tenants return 400 invalid_request instead of 404 when device id is not valid for this endpoint.
    const shouldFallback = status === 404 || (status === 400 && code === 'invalid_request');
    if (!shouldFallback) {
      throw error;
    }
  }

  // 2) Fallback: resolve by deviceName.
  const listUrl = `${GRAPH_BASE_URL}/directory/deviceLocalCredentials`;
  const listResponse = await axios.get(listUrl, {
    headers,
    params: {
      '$filter': `deviceName eq '${pcTag}'`,
      '$select': 'id,deviceName'
    }
  });

  const credentialInfo = listResponse.data?.value?.[0];
  if (!credentialInfo?.id) {
    throw new Error(`No deviceLocalCredentials entry found for deviceName ${pcTag}`);
  }

  const fullUrl = `${GRAPH_BASE_URL}/directory/deviceLocalCredentials/${credentialInfo.id}`;
  const fullResponse = await axios.get(fullUrl, {
    headers,
    params: { '$select': 'id,deviceName,credentials' }
  });

  return fullResponse.data;
}

module.exports = {
  getGraphAccessToken,
  findManagedDeviceByTag,
  getLapsPassword
};
