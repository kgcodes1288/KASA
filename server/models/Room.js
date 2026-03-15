const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
});

const roomSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    name: { type: String, required: true, trim: true },
    checklist: [checklistItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);
