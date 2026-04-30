const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getGraphAccessToken, findManagedDeviceByTag, getLapsPassword } = require('../services/graph');
const { createTicketArticle, closeTicket } = require('../services/zammad');

const router = express.Router();

async function handleApproveAction({ ticketId, pcTag, approvedBy }) {
  const requestId = uuidv4();

  try {
    console.log(`[APPROVE][${requestId}] Start: ticket=${ticketId}, pc_tag=${pcTag}, approved_by=${approvedBy}`);

    if (!ticketId || !pcTag) {
      throw new Error('ticketId or pcTag is missing');
    }

    console.log(`[APPROVE][${requestId}] Step 1/6: requesting Graph token`);
    const accessToken = await getGraphAccessToken();
    console.log(`[APPROVE][${requestId}] Success: Graph token received`);

    console.log(`[APPROVE][${requestId}] Step 2/6: searching managed device by tag=${pcTag}`);
    const device = await findManagedDeviceByTag(accessToken, pcTag);

    if (!device) {
      throw new Error(`No managed device found for tag ${pcTag}`);
    }

    console.log(`[APPROVE][${requestId}] Success: device found id=${device.id}`);

    console.log(`[APPROVE][${requestId}] Step 3/6: requesting LAPS password`);
    const lapsResponse = await getLapsPassword(accessToken, device.id);
    const password = lapsResponse?.value?.password || lapsResponse?.password;

    if (!password) {
      throw new Error('LAPS password not found in Graph response');
    }

    console.log(`[APPROVE][${requestId}] Success: LAPS password received`);

    const articleBody = [
      'ZLA automation result',
      `Approved by: ${approvedBy || 'Unknown Approver'}`,
      `PC Tag: ${pcTag}`,
      `LAPS Password: ${password}`
    ].join('\n');

    console.log(`[APPROVE][${requestId}] Step 4/6: sending article to Zammad`);
    await createTicketArticle(ticketId, articleBody, true);
    console.log(`[APPROVE][${requestId}] Success: article created in Zammad`);

    console.log(`[APPROVE][${requestId}] Step 5/6: closing Zammad ticket`);
    await closeTicket(ticketId);
    console.log(`[APPROVE][${requestId}] Success: ticket closed`);

    console.log(`[APPROVE][${requestId}] Completed successfully`);
    return { success: true };
  } catch (error) {
    console.error(`[APPROVE][${requestId}] Failed: ${error.message}`);
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
