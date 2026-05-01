const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { findManagedDeviceAcrossTenants, getLapsPassword } = require('../services/graph');
const { createTicketArticle, closeTicket } = require('../services/zammad');

const router = express.Router();

function decodeBase64IfNeeded(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    return decoded && decoded.trim() ? decoded : value;
  } catch (_error) {
    return value;
  }
}

function extractLapsPassword(lapsResponse) {
  const credentials = Array.isArray(lapsResponse?.credentials) ? lapsResponse.credentials : [];

  if (credentials.length > 0) {
    // Prefer the latest credential entry when multiple backups exist.
    const sorted = [...credentials].sort((a, b) => {
      const aDate = new Date(a?.backupDateTime || 0).getTime();
      const bDate = new Date(b?.backupDateTime || 0).getTime();
      return bDate - aDate;
    });

    const latest = sorted[0];
    return latest?.passwordBase64 || latest?.password || null;
  }

  return lapsResponse?.value?.password || lapsResponse?.password || null;
}

async function handleApproveAction({ ticketId, pcTag, approvedBy }) {
  const requestId = uuidv4();

  try {
    console.log(`[APPROVE][${requestId}] Start: ticket=${ticketId}, pc_tag=${pcTag}, approved_by=${approvedBy}`);

    if (!ticketId || !pcTag) {
      throw new Error('ticketId or pcTag is missing');
    }

    console.log(`[APPROVE][${requestId}] Step 1/6: scanning configured tenants for device ${pcTag}`);
    const match = await findManagedDeviceAcrossTenants(pcTag);
    let accessToken = null;
    let device = null;
    let resolvedTenantKey = null;
    if (match) {
      resolvedTenantKey = match.tenantKey;
      accessToken = match.accessToken;
      device = match.device;
      console.log(`[APPROVE][${requestId}] Success: matched tenant=${resolvedTenantKey}`);
    }

    if (!device) {
      throw new Error(`No managed device found for tag ${pcTag} in configured tenants`);
    }

    const aadDeviceId = device.azureADDeviceId || device.azureActiveDirectoryDeviceId || null;
    console.log(
      `[APPROVE][${requestId}] Success: device found id=${device.id}, aad_device_id=${aadDeviceId || 'n/a'}, tenant=${resolvedTenantKey}`
    );

    console.log(`[APPROVE][${requestId}] Step 3/6: requesting LAPS password`);
    const lapsLookupId = aadDeviceId || device.id;
    const lapsResponse = await getLapsPassword(accessToken, lapsLookupId, pcTag);
    const rawPassword = extractLapsPassword(lapsResponse);
    const password = decodeBase64IfNeeded(rawPassword);

    const credentialCount = Array.isArray(lapsResponse?.credentials) ? lapsResponse.credentials.length : 0;
    console.log(
      `[APPROVE][${requestId}] LAPS payload summary: id=${lapsResponse?.id || 'n/a'}, deviceName=${lapsResponse?.deviceName || 'n/a'}, credentials_count=${credentialCount}`
    );

    if (!password) {
      throw new Error(
        'LAPS password not found in Graph response (credentials are empty or no password field present)'
      );
    }

    console.log(`[APPROVE][${requestId}] Success: LAPS password received`);

    const articleBody = [
      'Zammad LAPS Automation',
      `Approved by: ${approvedBy || 'Unknown Approver'}`,
      " ",
      'Login: .\\WLapsAdmin',
      `Password: ${password}`
    ].join('\n');

    console.log(`[APPROVE][${requestId}] Step 4/6: sending article to Zammad`);
    await createTicketArticle(ticketId, articleBody, false);
    console.log(`[APPROVE][${requestId}] Success: article created in Zammad`);

    console.log(`[APPROVE][${requestId}] Step 5/6: closing Zammad ticket`);
    await closeTicket(ticketId);
    console.log(`[APPROVE][${requestId}] Success: ticket closed`);

    console.log(`[APPROVE][${requestId}] Completed successfully`);
    return { success: true };
  } catch (error) {
    const status = error.response?.status;
    const graphRequestId =
      error.response?.headers?.['request-id'] ||
      error.response?.data?.error?.innerError?.['request-id'];
    const graphClientRequestId = error.response?.data?.error?.innerError?.['client-request-id'];
    const graphDetails = error.response?.data;

    console.error(`[APPROVE][${requestId}] Failed: ${error.message}`);
    if (status) {
      console.error(`[APPROVE][${requestId}] HTTP status: ${status}`);
    }
    if (graphRequestId || graphClientRequestId) {
      console.error(
        `[APPROVE][${requestId}] Graph request ids: request-id=${graphRequestId || 'n/a'}, client-request-id=${graphClientRequestId || 'n/a'}`
      );
    }
    if (graphDetails) {
      console.error(`[APPROVE][${requestId}] Graph error payload:`);
      console.error(JSON.stringify(graphDetails, null, 2));
    }

    return { success: false, error: error.message };
  }
}

router.post('/', async (req, res) => {
  const { ticket_id: ticketId, pc_tag: pcTag, approved_by: approvedBy } = req.body || {};

  const result = await handleApproveAction({
    ticketId,
    pcTag,
    approvedBy: approvedBy || 'Manual API Trigger'
  });

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.json(result);
});

module.exports = router;
module.exports.handleApproveAction = handleApproveAction;
