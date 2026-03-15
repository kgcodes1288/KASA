const mongoose = require('mongoose');

const jobChecklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
});

const jobSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    cleaner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    checkoutDate: { type: Date, required: true },
    checkinDate: { type: Date },
    guestName: { type: String, default: 'Guest' },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    checklist: [jobChecklistItemSchema],
    smsSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Job', jobSchema);
