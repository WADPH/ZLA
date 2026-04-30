const express = require('express');
const { sendApprovalCard } = require('../services/teams');
const { extractPcTag } = require('../utils/auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { ticket_id: ticketId, customer, body, pc_tag: providedPcTag } = req.body || {};

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

    await sendApprovalCard({
      ticketId,
      customer,
      reason: body,
      pcTag
    });

    console.log(`[ZAMMAD] Success: approval card sent for ticket=${ticketId}`);
    return res.json({ success: true, ticket_id: ticketId, pc_tag: pcTag });
  } catch (error) {
    console.error(`[ZAMMAD] Failed to process webhook: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
