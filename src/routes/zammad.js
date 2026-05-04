const express = require('express');
const { sendApprovalCard, sendMissingTagCard } = require('../services/teams');
const { extractPcTag, verifyZammadWebhookSignature } = require('../utils/auth');
const { findManagedDeviceAcrossTenants } = require('../services/graph');
const { getTicketById, getUserById } = require('../services/zammad');

const router = express.Router();

router.post('/', async (req, res) => {
  const {
    ticket_id: ticketId,
    customer,
    customer_email: customerEmailRaw,
    body,
    lar_reason: larReason,
    pc_tag: providedPcTag
  } = req.body || {};

  try {
    console.log(`[ZAMMAD] Incoming webhook for ticket=${ticketId}`);

    const hmacSecret = process.env.ZAMMAD_WEBHOOK_SECRET || '';
    if (hmacSecret) {
      const sigCheck = verifyZammadWebhookSignature(req, hmacSecret);
      if (!sigCheck.ok) {
        console.warn(`[ZAMMAD] Webhook signature validation failed: ${sigCheck.reason}`);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      console.log('[ZAMMAD] Webhook signature validated');
    } else {
      console.warn('[ZAMMAD] ZAMMAD_WEBHOOK_SECRET is not set: signature validation is disabled');
    }

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

    if (pcTag) {
      try {
        console.log(`[ZAMMAD] Tenant scan: searching device ${pcTag} across configured tenants`);
        const match = await findManagedDeviceAcrossTenants(pcTag);
        if (!match) {
          throw new Error(`Device ${pcTag} not found in any configured tenant`);
        }

        const managedDevice = match.device;
        console.log(`[ZAMMAD] Tenant scan result: matched tenant=${match.tenantKey}, device_id=${managedDevice.id}`);

        primaryUserEmail = (managedDevice.userPrincipalName || managedDevice.emailAddress || '').trim().toLowerCase() || null;
        console.log(`[ZAMMAD] Compare step: primary user email from Graph=${primaryUserEmail || 'n/a'}`);
      } catch (compareError) {
        console.error(`[ZAMMAD] Compare step failed: ${compareError.message}`);
      }
    } else {
      console.warn('[ZAMMAD] PC tag missing: skip tenant scan and send missing-tag notification card');
    }

    if (customerEmail && primaryUserEmail && customerEmail !== primaryUserEmail) {
      mismatchWarning = `⚠️ Primary user mismatch: ticket user (${customerEmail}) does not match device primary user (${primaryUserEmail}).`;
    }
    console.log(
      `[ZAMMAD] Compare result: ${
        customerEmail && primaryUserEmail ? (customerEmail === primaryUserEmail ? 'match' : 'mismatch') : 'insufficient-data'
      }`
    );

    if (pcTag) {
      await sendApprovalCard({
        ticketId,
        customer,
        customerEmail,
        body,
        larReason,
        pcTag,
        mismatchWarning
      });
      console.log(`[ZAMMAD] Success: approval card sent for ticket=${ticketId}`);
      return res.json({ success: true, ticket_id: ticketId, pc_tag: pcTag, mode: 'approval-card' });
    }

    await sendMissingTagCard({
      ticketId,
      customer,
      customerEmail,
      body,
      larReason
    });
    console.log(`[ZAMMAD] Success: missing-tag notification card sent for ticket=${ticketId}`);
    return res.json({ success: true, ticket_id: ticketId, pc_tag: null, mode: 'missing-tag-card' });
  } catch (error) {
    console.error(`[ZAMMAD] Failed to process webhook: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
