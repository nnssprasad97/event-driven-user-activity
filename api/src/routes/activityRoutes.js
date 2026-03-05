'use strict';

const express = require('express');
const { ingestActivity } = require('../controllers/activityController');

const router = express.Router();

// POST /api/v1/activities
router.post('/', ingestActivity);

module.exports = router;
