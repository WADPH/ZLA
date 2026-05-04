const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { findManagedDeviceAcrossTenants, getLapsPassword } = require('../services/graph');
const {
  createTicketArticle,
  closeTicket,
  findUserByEmail,
  assignTicketOwner,
  findGroupByName,
  assignTicketGroup,
  assignTicketGroupByName
} = require('../services/zammad');

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

function normalizeEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text.includes('@')) {
    return null;
  }
  return text;
}

function buildGroupNameFromEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  const localPart = normalized.split('@')[0];
  if (!localPart) {
    return null;
  }

  const words = localPart
    .replace(/[_-]+/g, '.')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return words.length ? words.join(' ') : null;
}

async function handleApproveAction({ ticketId, pcTag, approvedBy, approvedByEmail }) {
  const requestId = uuidv4();

  try {
    console.log(
      `[APPROVE][${requestId}] Start: ticket=${ticketId}, pc_tag=${pcTag}, approved_by=${approvedBy}, approved_by_email=${approvedByEmail || 'n/a'}`
    );

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

    console.log(`[APPROVE][${requestId}] Step 5/6: assigning ticket owner in Zammad (best effort)`);
    const normalizedApprovedByEmail = normalizeEmail(approvedByEmail || approvedBy);
    if (!normalizedApprovedByEmail) {
      console.log(`[APPROVE][${requestId}] Skip owner assignment: approver email not available`);
    } else {
      try {
        console.log(`[APPROVE][${requestId}] Owner assignment lookup email=${normalizedApprovedByEmail}`);
        const zammadUser = await findUserByEmail(normalizedApprovedByEmail);
        if (!zammadUser?.id) {
          console.warn(
            `[APPROVE][${requestId}] Owner assignment skipped: user with email ${normalizedApprovedByEmail} not found in Zammad`
          );
        } else {
          await assignTicketOwner(ticketId, zammadUser.id);
          console.log(`[APPROVE][${requestId}] Success: owner assigned to user_id=${zammadUser.id}`);
        }
      } catch (assignError) {
        console.error(`[APPROVE][${requestId}] Owner assignment failed: ${assignError.message}`);
      }
    }

    console.log(`[APPROVE][${requestId}] Step 6/7: assigning ticket group in Zammad (best effort)`);
    if (!normalizedApprovedByEmail) {
      console.log(`[APPROVE][${requestId}] Skip group assignment: approver email not available`);
    } else {
      const expectedGroupName = buildGroupNameFromEmail(normalizedApprovedByEmail);
      if (!expectedGroupName) {
        console.log(`[APPROVE][${requestId}] Skip group assignment: failed to derive group name from email`);
      } else {
        try {
          console.log(`[APPROVE][${requestId}] Group assignment lookup name="${expectedGroupName}"`);
          const group = await findGroupByName(expectedGroupName);
          if (!group?.id) {
            console.warn(`[APPROVE][${requestId}] Group assignment skipped: group "${expectedGroupName}" not found`);
          } else {
            try {
              await assignTicketGroup(ticketId, group.id);
              console.log(`[APPROVE][${requestId}] Success: group assigned to group_id=${group.id} (${group.name})`);
            } catch (groupIdAssignError) {
              console.error(
                `[APPROVE][${requestId}] Group assignment by id failed: ${groupIdAssignError.message}`
              );
              if (groupIdAssignError.response?.status) {
                console.error(
                  `[APPROVE][${requestId}] Group assignment by id HTTP status: ${groupIdAssignError.response.status}`
                );
              }
              if (groupIdAssignError.response?.data) {
                console.error(`[APPROVE][${requestId}] Group assignment by id payload:`);
                console.error(JSON.stringify(groupIdAssignError.response.data, null, 2));
              }

              try {
                await assignTicketGroupByName(ticketId, group.name);
                console.log(
                  `[APPROVE][${requestId}] Success: group assigned by name fallback (${group.name})`
                );
              } catch (groupNameAssignError) {
                console.error(
                  `[APPROVE][${requestId}] Group assignment by name fallback failed: ${groupNameAssignError.message}`
                );
                if (groupNameAssignError.response?.status) {
                  console.error(
                    `[APPROVE][${requestId}] Group assignment by name HTTP status: ${groupNameAssignError.response.status}`
                  );
                }
                if (groupNameAssignError.response?.data) {
                  console.error(`[APPROVE][${requestId}] Group assignment by name payload:`);
                  console.error(JSON.stringify(groupNameAssignError.response.data, null, 2));
                }
              }
            }
          }
        } catch (groupAssignError) {
          console.error(`[APPROVE][${requestId}] Group assignment failed: ${groupAssignError.message}`);
        }
      }
    }

    console.log(`[APPROVE][${requestId}] Step 7/7: closing Zammad ticket`);
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
  const {
    ticket_id: ticketId,
    pc_tag: pcTag,
    approved_by: approvedBy,
    approved_by_email: approvedByEmail
  } = req.body || {};

  const result = await handleApproveAction({
    ticketId,
    pcTag,
    approvedBy: approvedBy || 'Manual API Trigger',
    approvedByEmail: approvedByEmail || null
  });

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.json(result);
});

module.exports = router;
module.exports.handleApproveAction = handleApproveAction;
