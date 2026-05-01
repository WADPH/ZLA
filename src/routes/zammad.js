const express = require('express');
const { sendApprovalCard } = require('../services/teams');
const { extractPcTag } = require('../utils/auth');
const { getGraphAccessToken, findManagedDeviceByTag } = require('../services/graph');
const { getTicketById, getUserById } = require('../services/zammad');

const router = express.Router();

router.post('/', async (req, res) => {
  const { ticket_id: ticketId, customer, customer_email: customerEmailRaw, body, pc_tag: providedPcTag } = req.body || {};

  try {
    console.log(`[ZAMMAD] Incoming webhook for ticket=${ticketId}`);

    const extractedPcTag = extractPcTag(body);
    const pcTag = (providedPcTag || extractedPcTag || '').toUpperCase() || null;

    if (providedPcTag) {
      console.log(`[ZAMMAD] PC tag provided directly: ${pcTag}`);
    } else if (extractedPcTag) {
      console.log(`[ZAMMAD] PC tag extracted from body: ${pcTag}`);
    } else {
      console.warn('[ZAMMAD] PC tag not found in webhook body');
    }

    if (!ticketId) {
      return res.status(400).json({ error: 'ticket_id is required' });
    }

    if (!pcTag) {
      return res.status(400).json({ error: 'pc_tag was not provided and could not be extracted from body' });
    }

    let customerEmail = (customerEmailRaw || '').trim().toLowerCase() || null;
    let primaryUserEmail = null;
    let mismatchWarning = null;

    console.log(`[ZAMMAD] Compare step: customer email from webhook=${customerEmail || 'n/a'}`);

    if (!customerEmail) {
      try {
        const ticket = await getTicketById(ticketId, true);
        const customerId = ticket?.customer_id;
        console.log(`[ZAMMAD] Compare step: ticket customer_id=${customerId || 'n/a'}`);

        if (customerId) {
          const customerUser = await getUserById(customerId);
          customerEmail = (customerUser?.email || customerUser?.login || '').trim().toLowerCase() || null;
        }

        console.log(`[ZAMMAD] Compare step: customer email from user profile=${customerEmail || 'n/a'}`);
      } catch (ticketError) {
        console.error(`[ZAMMAD] Compare step: failed to load ticket customer email: ${ticketError.message}`);
      }
    }

    try {
      const graphToken = await getGraphAccessToken();
      const managedDevice = await findManagedDeviceByTag(graphToken, pcTag);

      if (managedDevice?.id) {
        primaryUserEmail = (
          managedDevice.userPrincipalName ||
          managedDevice.emailAddress ||
          ''
        ).trim().toLowerCase() || null;
      }

      console.log(`[ZAMMAD] Compare step: primary user email from Graph=${primaryUserEmail || 'n/a'}`);
    } catch (compareError) {
      console.error(`[ZAMMAD] Compare step failed: ${compareError.message}`);
    }

    if (customerEmail && primaryUserEmail && customerEmail !== primaryUserEmail) {
      mismatchWarning = `⚠️ Primary user mismatch: ticket user (${customerEmail}) does not match device primary user (${primaryUserEmail}).`;
    }
    console.log(
      `[ZAMMAD] Compare result: ${
        customerEmail && primaryUserEmail ? (customerEmail === primaryUserEmail ? 'match' : 'mismatch') : 'insufficient-data'
      }`
    );

    await sendApprovalCard({
      ticketId,
      customer,
      customerEmail,
      reason: body,
      pcTag,
      mismatchWarning
    });

    console.log(`[ZAMMAD] Success: approval card sent for ticket=${ticketId}`);
    return res.json({ success: true, ticket_id: ticketId, pc_tag: pcTag });
  } catch (error) {
    console.error(`[ZAMMAD] Failed to process webhook: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
