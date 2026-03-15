const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    icalUrl: { type: String, required: true, trim: true },
    cleaners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastSynced: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Listing', listingSchema);
