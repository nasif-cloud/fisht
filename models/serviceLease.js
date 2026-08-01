const mongoose = require('mongoose');

const serviceLeaseSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  leaderId: { type: String, required: true },
  instanceId: { type: String, required: true },
  startedAt: { type: Date, required: true },
  heartbeatAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
}, {
  versionKey: false,
  collection: 'service_leases',
});

module.exports = mongoose.model('ServiceLease', serviceLeaseSchema);
