import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    type: { type: String, enum: ['full-time', 'part-time', 'contract', 'freelance'], required: true },
    location: { type: String, required: true },
    company: { type: String, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const Job = mongoose.model('Job', jobSchema);

export default Job;