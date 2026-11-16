const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'appliance-repair-system',
  brokers: ['localhost:9092']
});

module.exports = {
  producer: kafka.producer(),
  consumer: (groupId) => kafka.consumer({ groupId })
};

