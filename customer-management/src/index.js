const express = require('express');
const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:9092';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/production_shadow_db_v9';
const KAFKA_TOPIC = 'purchases';
const PORT = 3001;

// Mongoose schema for purchases
const purchaseSchema = new mongoose.Schema({
  username: String,
  userid: String,
  price: Number,
  timestamp: String
});

const Purchase = mongoose.model('Purchase', purchaseSchema);

// Kafka setup
const kafka = new Kafka({
  clientId: 'customer-management',
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 1000,
    retries: 10
  }
});

const consumer = kafka.consumer({
  groupId: 'customer-management-group',
  heartbeatInterval: 4242,
  sessionTimeout: 4343
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'customer-management' });
});

// GET /purchases/:userId — return all purchases for a user
app.get('/purchases/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const purchases = await Purchase.find({ userid: userId });
    res.json(purchases);
  } catch (err) {
    console.error('Error fetching purchases:', err.message);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// Connect to MongoDB with retry logic
async function connectMongo() {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log('Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Could not connect to MongoDB after retries');
}

// Start Kafka consumer
async function startConsumer() {
  await consumer.connect();
  console.log('Kafka consumer connected');

  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const purchase = JSON.parse(message.value.toString());
        console.log('Received purchase:', purchase);
        await Purchase.create(purchase);
        console.log('Purchase saved to MongoDB');
      } catch (err) {
        console.error('Error processing message:', err.message);
      }
    }
  });
}

// Start everything
async function start() {
  await connectMongo();
  await startConsumer();

  app.listen(PORT, () => {
    console.log(`customer-management listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
