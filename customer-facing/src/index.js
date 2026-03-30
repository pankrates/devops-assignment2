const express = require('express');
const { Kafka } = require('kafkajs');
const axios = require('axios');

const app = express();
app.use(express.json());

// Add X-Region-Affinity header to every response
app.use((req, res, next) => {
  res.setHeader('X-Region-Affinity', 'local');
  next();
});

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:9092';
const CUSTOMER_MANAGEMENT_URL = process.env.CUSTOMER_MANAGEMENT_URL || 'http://customer-management:3001';
const KAFKA_TOPIC = 'purchases';
const PORT = 3000;

const kafka = new Kafka({
  clientId: 'customer-facing',
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 1000,
    retries: 10
  }
});

const producer = kafka.producer();

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'customer-facing' });
});

// POST /buy — publish purchase event to Kafka
app.post('/buy', async (req, res) => {
  try {
    const { username, userid, price } = req.body;

    if (!username || !userid || !price) {
      return res.status(400).json({ error: 'Missing required fields: username, userid, price' });
    }

    const purchase = {
      username,
      userid,
      price,
      timestamp: new Date().toISOString()
    };

    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [{ key: userid, value: JSON.stringify(purchase) }]
    });

    res.status(201).json({ message: 'Purchase recorded', purchase });
  } catch (err) {
    console.error('Error publishing to Kafka:', err.message);
    res.status(500).json({ error: 'Failed to record purchase' });
  }
});

// GET /getAllUserBuys/:userId — proxy to customer-management
app.get('/getAllUserBuys/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const response = await axios.get(`${CUSTOMER_MANAGEMENT_URL}/purchases/${userId}`);
    res.json(response.data);
  } catch (err) {
    console.error('Error fetching purchases:', err.message);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// Connect producer then start server
async function start() {
  console.log('Connecting Kafka producer...');
  await producer.connect();
  console.log('Kafka producer connected');

  app.listen(PORT, () => {
    console.log(`customer-facing listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
